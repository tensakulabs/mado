use std::path::Path;

use chrono::{DateTime, TimeZone, Utc};
use git2::{DiffOptions, Repository, Signature, StatusOptions};
use serde::{Deserialize, Serialize};
use tracing;

/// A saved milestone (git commit) in a session's workspace.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Milestone {
    /// Git commit OID (hex string).
    pub oid: String,
    /// Commit message.
    pub message: String,
    /// Commit timestamp.
    pub timestamp: DateTime<Utc>,
    /// Number of files changed in this commit.
    pub files_changed: usize,
    /// Total lines added.
    pub insertions: usize,
    /// Total lines deleted.
    pub deletions: usize,
}

/// Summary of a diff between two commits.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffSummary {
    pub files: Vec<FileDiff>,
    pub total_insertions: usize,
    pub total_deletions: usize,
}

/// Diff information for a single file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileDiff {
    pub path: String,
    pub insertions: usize,
    pub deletions: usize,
    pub status: String, // "added", "modified", "deleted", "renamed"
}

/// Errors from git operations.
#[derive(Debug, thiserror::Error)]
pub enum GitError {
    #[error("Git error: {0}")]
    Git(#[from] git2::Error),

    #[error("No changes to commit")]
    NothingToCommit,

    #[error("Commit not found: {0}")]
    CommitNotFound(String),

    #[error("Path error: {0}")]
    PathError(String),
}

/// Initialize a git repository at the given path if one doesn't exist.
pub fn init_repo(path: &Path) -> Result<Repository, GitError> {
    if path.join(".git").exists() {
        Ok(Repository::open(path)?)
    } else {
        tracing::info!("Initializing git repo at: {}", path.display());
        let repo = Repository::init(path)?;

        // Create initial commit so the repo has a HEAD.
        {
            let sig = make_signature()?;
            let tree_id = {
                let mut index = repo.index()?;
                index.write_tree()?
            };
            let tree = repo.find_tree(tree_id)?;
            repo.commit(Some("HEAD"), &sig, &sig, "Initial workspace", &tree, &[])?;
        }

        Ok(repo)
    }
}

/// Save a milestone: stage all changes and commit.
pub fn save_milestone(path: &Path, message: &str) -> Result<Milestone, GitError> {
    let repo = Repository::open(path)?;

    // Check if there are any changes to commit.
    let mut status_opts = StatusOptions::new();
    status_opts
        .include_untracked(true)
        .recurse_untracked_dirs(true);

    let statuses = repo.statuses(Some(&mut status_opts))?;
    if statuses.is_empty() {
        return Err(GitError::NothingToCommit);
    }

    // Stage all changes.
    let mut index = repo.index()?;
    index.add_all(["."], git2::IndexAddOption::DEFAULT, None)?;
    index.write()?;
    let tree_id = index.write_tree()?;
    let tree = repo.find_tree(tree_id)?;

    // Get the parent commit (HEAD).
    let parent = repo.head()?.peel_to_commit()?;

    // Create the commit.
    let sig = make_signature()?;
    let oid = repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &[&parent])?;

    // Get diff stats.
    let mut diff_opts = DiffOptions::new();
    let diff = repo.diff_tree_to_tree(
        Some(&parent.tree()?),
        Some(&tree),
        Some(&mut diff_opts),
    )?;
    let stats = diff.stats()?;

    let milestone = Milestone {
        oid: oid.to_string(),
        message: message.to_string(),
        timestamp: Utc::now(),
        files_changed: stats.files_changed(),
        insertions: stats.insertions(),
        deletions: stats.deletions(),
    };

    tracing::info!(
        "Saved milestone {} at {}: {} (+{} -{})",
        &milestone.oid[..8],
        path.display(),
        message,
        stats.insertions(),
        stats.deletions()
    );

    Ok(milestone)
}

/// List recent milestones (commits) in a repository.
pub fn list_milestones(path: &Path, limit: usize) -> Result<Vec<Milestone>, GitError> {
    let repo = Repository::open(path)?;
    let mut revwalk = repo.revwalk()?;
    revwalk.push_head()?;
    revwalk.set_sorting(git2::Sort::TIME)?;

    let mut milestones = Vec::new();

    for oid_result in revwalk.take(limit) {
        let oid = oid_result?;
        let commit = repo.find_commit(oid)?;

        let message = commit
            .message()
            .unwrap_or("(no message)")
            .to_string();

        let time = commit.time();
        let timestamp = Utc
            .timestamp_opt(time.seconds(), 0)
            .single()
            .unwrap_or_else(Utc::now);

        // Get diff stats against parent.
        let (files_changed, insertions, deletions) = if commit.parent_count() > 0 {
            let parent = commit.parent(0)?;
            let mut diff_opts = DiffOptions::new();
            let diff = repo.diff_tree_to_tree(
                Some(&parent.tree()?),
                Some(&commit.tree()?),
                Some(&mut diff_opts),
            )?;
            let stats = diff.stats()?;
            (stats.files_changed(), stats.insertions(), stats.deletions())
        } else {
            (0, 0, 0) // Initial commit
        };

        milestones.push(Milestone {
            oid: oid.to_string(),
            message,
            timestamp,
            files_changed,
            insertions,
            deletions,
        });
    }

    Ok(milestones)
}

/// Get a diff summary between two commits.
pub fn diff_milestones(
    path: &Path,
    from_oid: &str,
    to_oid: &str,
) -> Result<DiffSummary, GitError> {
    let repo = Repository::open(path)?;

    let from_commit = repo
        .find_commit(git2::Oid::from_str(from_oid)?)
        .map_err(|_| GitError::CommitNotFound(from_oid.to_string()))?;
    let to_commit = repo
        .find_commit(git2::Oid::from_str(to_oid)?)
        .map_err(|_| GitError::CommitNotFound(to_oid.to_string()))?;

    let mut diff_opts = DiffOptions::new();
    let diff = repo.diff_tree_to_tree(
        Some(&from_commit.tree()?),
        Some(&to_commit.tree()?),
        Some(&mut diff_opts),
    )?;

    // Use diff stats and print callback approach to avoid borrow issues.
    let stats = diff.stats()?;
    let total_insertions = stats.insertions();
    let total_deletions = stats.deletions();

    // Collect file-level info from deltas.
    let mut files = Vec::new();
    let num_deltas = diff.deltas().len();
    for i in 0..num_deltas {
        let delta = diff.get_delta(i).unwrap();
        let path = delta
            .new_file()
            .path()
            .or_else(|| delta.old_file().path())
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| "(unknown)".to_string());

        let status = match delta.status() {
            git2::Delta::Added => "added",
            git2::Delta::Deleted => "deleted",
            git2::Delta::Modified => "modified",
            git2::Delta::Renamed => "renamed",
            _ => "modified",
        };

        files.push(FileDiff {
            path,
            insertions: 0,
            deletions: 0,
            status: status.to_string(),
        });
    }

    // Get per-file line stats by iterating patches.
    for (i, file) in files.iter_mut().enumerate() {
        if let Ok(patch) = git2::Patch::from_diff(&diff, i) {
            if let Some(patch) = patch {
                let (_, additions, deletions) = patch.line_stats().unwrap_or((0, 0, 0));
                file.insertions = additions;
                file.deletions = deletions;
            }
        }
    }

    Ok(DiffSummary {
        files,
        total_insertions,
        total_deletions,
    })
}

/// Restore the working directory to a specific commit (hard reset).
pub fn restore_milestone(path: &Path, oid: &str) -> Result<(), GitError> {
    let repo = Repository::open(path)?;
    let commit = repo
        .find_commit(git2::Oid::from_str(oid)?)
        .map_err(|_| GitError::CommitNotFound(oid.to_string()))?;

    let object = commit.as_object();
    repo.reset(object, git2::ResetType::Hard, None)?;

    tracing::info!("Restored to milestone {} at {}", &oid[..8], path.display());
    Ok(())
}

/// Get current workspace changes (uncommitted modifications since HEAD).
/// Returns a DiffSummary of working directory vs HEAD.
pub fn workspace_changes(path: &Path) -> Result<DiffSummary, GitError> {
    let repo = Repository::open(path)?;

    // Get HEAD tree.
    let head_commit = repo.head()?.peel_to_commit()?;
    let head_tree = head_commit.tree()?;

    // diff_tree_to_workdir_with_index gives us HEAD -> workdir including staged.
    let mut diff_opts = DiffOptions::new();
    diff_opts.include_untracked(true);
    diff_opts.recurse_untracked_dirs(true);

    let diff = repo.diff_tree_to_workdir_with_index(
        Some(&head_tree),
        Some(&mut diff_opts),
    )?;

    let stats = diff.stats()?;
    let total_insertions = stats.insertions();
    let total_deletions = stats.deletions();

    let mut files = Vec::new();
    let num_deltas = diff.deltas().len();
    for i in 0..num_deltas {
        let delta = diff.get_delta(i).unwrap();
        let file_path = delta
            .new_file()
            .path()
            .or_else(|| delta.old_file().path())
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| "(unknown)".to_string());

        let status = match delta.status() {
            git2::Delta::Added => "added",
            git2::Delta::Deleted => "deleted",
            git2::Delta::Modified => "modified",
            git2::Delta::Renamed => "renamed",
            git2::Delta::Untracked => "added",
            _ => "modified",
        };

        files.push(FileDiff {
            path: file_path,
            insertions: 0,
            deletions: 0,
            status: status.to_string(),
        });
    }

    // Get per-file line stats.
    for (i, file) in files.iter_mut().enumerate() {
        if let Ok(patch) = git2::Patch::from_diff(&diff, i) {
            if let Some(patch) = patch {
                let (_, additions, deletions) = patch.line_stats().unwrap_or((0, 0, 0));
                file.insertions = additions;
                file.deletions = deletions;
            }
        }
    }

    Ok(DiffSummary {
        files,
        total_insertions,
        total_deletions,
    })
}

/// Create a git signature for commits.
fn make_signature<'a>() -> Result<Signature<'a>, git2::Error> {
    Signature::now("Kobo", "kobo@local")
}
