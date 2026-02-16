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

/// Git staging status: staged and unstaged files separately.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitStatus {
    pub staged: Vec<FileDiff>,
    pub unstaged: Vec<FileDiff>,
}

/// Get the staging status of a repository, separating staged and unstaged files.
pub fn git_status(path: &Path) -> Result<GitStatus, GitError> {
    let repo = Repository::open(path)?;

    let mut status_opts = StatusOptions::new();
    status_opts
        .include_untracked(true)
        .recurse_untracked_dirs(true);

    let statuses = repo.statuses(Some(&mut status_opts))?;

    let mut staged = Vec::new();
    let mut unstaged = Vec::new();

    for entry in statuses.iter() {
        let file_path = entry.path().unwrap_or("(unknown)").to_string();
        let s = entry.status();

        // Staged changes (index vs HEAD).
        if s.intersects(
            git2::Status::INDEX_NEW
                | git2::Status::INDEX_MODIFIED
                | git2::Status::INDEX_DELETED
                | git2::Status::INDEX_RENAMED
                | git2::Status::INDEX_TYPECHANGE,
        ) {
            let status = if s.contains(git2::Status::INDEX_NEW) {
                "added"
            } else if s.contains(git2::Status::INDEX_MODIFIED) {
                "modified"
            } else if s.contains(git2::Status::INDEX_DELETED) {
                "deleted"
            } else if s.contains(git2::Status::INDEX_RENAMED) {
                "renamed"
            } else {
                "modified"
            };

            staged.push(FileDiff {
                path: file_path.clone(),
                insertions: 0,
                deletions: 0,
                status: status.to_string(),
            });
        }

        // Unstaged changes (workdir vs index).
        if s.intersects(
            git2::Status::WT_MODIFIED
                | git2::Status::WT_DELETED
                | git2::Status::WT_RENAMED
                | git2::Status::WT_TYPECHANGE
                | git2::Status::WT_NEW,
        ) {
            let status = if s.contains(git2::Status::WT_NEW) {
                "added"
            } else if s.contains(git2::Status::WT_MODIFIED) {
                "modified"
            } else if s.contains(git2::Status::WT_DELETED) {
                "deleted"
            } else if s.contains(git2::Status::WT_RENAMED) {
                "renamed"
            } else {
                "modified"
            };

            unstaged.push(FileDiff {
                path: file_path,
                insertions: 0,
                deletions: 0,
                status: status.to_string(),
            });
        }
    }

    // Populate line stats for staged files (index vs HEAD).
    if !staged.is_empty() {
        let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
        let mut diff_opts = DiffOptions::new();
        let diff = repo.diff_tree_to_index(
            head_tree.as_ref(),
            Some(&repo.index()?),
            Some(&mut diff_opts),
        )?;

        let mut staged_stats: std::collections::HashMap<String, (usize, usize)> =
            std::collections::HashMap::new();
        for i in 0..diff.deltas().len() {
            let delta = diff.get_delta(i).unwrap();
            let dp = delta
                .new_file()
                .path()
                .or_else(|| delta.old_file().path())
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();
            if let Ok(Some(patch)) = git2::Patch::from_diff(&diff, i) {
                let (_, additions, deletions) = patch.line_stats().unwrap_or((0, 0, 0));
                staged_stats.insert(dp, (additions, deletions));
            }
        }

        for file in staged.iter_mut() {
            if let Some((ins, del)) = staged_stats.get(&file.path) {
                file.insertions = *ins;
                file.deletions = *del;
            }
        }
    }

    // Populate line stats for unstaged files (workdir vs index).
    if !unstaged.is_empty() {
        let mut diff_opts = DiffOptions::new();
        diff_opts.include_untracked(true);
        diff_opts.recurse_untracked_dirs(true);
        let diff = repo.diff_index_to_workdir(Some(&repo.index()?), Some(&mut diff_opts))?;

        let mut unstaged_stats: std::collections::HashMap<String, (usize, usize)> =
            std::collections::HashMap::new();
        for i in 0..diff.deltas().len() {
            let delta = diff.get_delta(i).unwrap();
            let dp = delta
                .new_file()
                .path()
                .or_else(|| delta.old_file().path())
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();
            if let Ok(Some(patch)) = git2::Patch::from_diff(&diff, i) {
                let (_, additions, deletions) = patch.line_stats().unwrap_or((0, 0, 0));
                unstaged_stats.insert(dp, (additions, deletions));
            }
        }

        for file in unstaged.iter_mut() {
            if let Some((ins, del)) = unstaged_stats.get(&file.path) {
                file.insertions = *ins;
                file.deletions = *del;
            }
        }
    }

    Ok(GitStatus { staged, unstaged })
}

/// Get the unified diff content for a single file.
/// If `is_staged` is true, diffs index vs HEAD. Otherwise diffs workdir vs index.
pub fn git_file_diff(path: &Path, file_path: &str, is_staged: bool) -> Result<String, GitError> {
    let repo = Repository::open(path)?;

    let mut diff_opts = DiffOptions::new();
    diff_opts.pathspec(file_path);

    let diff = if is_staged {
        // Index vs HEAD (staged changes).
        let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
        repo.diff_tree_to_index(
            head_tree.as_ref(),
            Some(&repo.index()?),
            Some(&mut diff_opts),
        )?
    } else {
        // Workdir vs index (unstaged changes).
        diff_opts.include_untracked(true);
        diff_opts.recurse_untracked_dirs(true);
        repo.diff_index_to_workdir(Some(&repo.index()?), Some(&mut diff_opts))?
    };

    // Build unified diff string from the diff output.
    // Include all lines: headers, hunk markers, and content.
    let mut diff_text = String::new();
    diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
        let origin = line.origin();
        // Include the origin character for content lines (+, -, space).
        // For headers and other lines, just include the content.
        match origin {
            '+' | '-' | ' ' => {
                diff_text.push(origin);
            }
            // File headers, hunk headers, etc. - include content without prefix
            'F' | 'H' | '>' | '<' | 'B' => {
                // F = file header, H = hunk header, etc.
            }
            _ => {}
        }
        diff_text.push_str(&String::from_utf8_lossy(line.content()));
        true
    })?;

    Ok(diff_text)
}

/// Stage a single file (equivalent to `git add <file>`).
pub fn git_stage_file(path: &Path, file_path: &str) -> Result<(), GitError> {
    let repo = Repository::open(path)?;
    let mut index = repo.index()?;

    let full_path = path.join(file_path);
    if full_path.exists() {
        // File exists: add it to the index.
        index.add_path(std::path::Path::new(file_path))?;
    } else {
        // File was deleted: remove it from the index.
        index.remove_path(std::path::Path::new(file_path))?;
    }

    index.write()?;

    tracing::info!("Staged file: {} in {}", file_path, path.display());
    Ok(())
}

/// Unstage a single file (equivalent to `git reset HEAD <file>`).
/// Resets the index entry to match HEAD, leaving the working directory untouched.
pub fn git_unstage_file(path: &Path, file_path: &str) -> Result<(), GitError> {
    let repo = Repository::open(path)?;

    // Get HEAD commit's tree.
    let head = repo.head()?;
    let head_commit = head.peel_to_commit()?;
    let head_tree = head_commit.tree()?;

    let file_p = std::path::Path::new(file_path);

    let mut index = repo.index()?;

    match head_tree.get_path(file_p) {
        Ok(entry) => {
            // File exists in HEAD: restore the index entry from HEAD.
            let index_entry = git2::IndexEntry {
                ctime: git2::IndexTime::new(0, 0),
                mtime: git2::IndexTime::new(0, 0),
                dev: 0,
                ino: 0,
                mode: entry.filemode() as u32,
                uid: 0,
                gid: 0,
                file_size: 0,
                id: entry.id(),
                flags: 0,
                flags_extended: 0,
                path: file_path.as_bytes().to_vec(),
            };
            index.add(&index_entry)?;
        }
        Err(_) => {
            // File does not exist in HEAD (was newly added): remove from index.
            index.remove_path(file_p)?;
        }
    }

    index.write()?;

    tracing::info!("Unstaged file: {} in {}", file_path, path.display());
    Ok(())
}

/// Stage multiple files in a single index operation (equivalent to `git add <file1> <file2> ...`).
/// Opens the repository once, iterates all paths, writes the index once.
pub fn git_stage_files(path: &Path, file_paths: &[String]) -> Result<(), GitError> {
    let repo = Repository::open(path)?;
    let mut index = repo.index()?;

    for file_path in file_paths {
        let full_path = path.join(file_path);
        if full_path.exists() {
            index.add_path(std::path::Path::new(file_path))?;
        } else {
            // File was deleted: remove it from the index.
            index.remove_path(std::path::Path::new(file_path))?;
        }
    }

    index.write()?;

    tracing::info!("Staged {} files in {}", file_paths.len(), path.display());
    Ok(())
}

/// Unstage multiple files in a single index operation (equivalent to `git reset HEAD <file1> <file2> ...`).
/// Opens the repository once, iterates all paths, writes the index once.
pub fn git_unstage_files(path: &Path, file_paths: &[String]) -> Result<(), GitError> {
    let repo = Repository::open(path)?;

    // Get HEAD commit's tree.
    let head = repo.head()?;
    let head_commit = head.peel_to_commit()?;
    let head_tree = head_commit.tree()?;

    let mut index = repo.index()?;

    for file_path in file_paths {
        let file_p = std::path::Path::new(file_path);

        match head_tree.get_path(file_p) {
            Ok(entry) => {
                // File exists in HEAD: restore the index entry from HEAD.
                let index_entry = git2::IndexEntry {
                    ctime: git2::IndexTime::new(0, 0),
                    mtime: git2::IndexTime::new(0, 0),
                    dev: 0,
                    ino: 0,
                    mode: entry.filemode() as u32,
                    uid: 0,
                    gid: 0,
                    file_size: 0,
                    id: entry.id(),
                    flags: 0,
                    flags_extended: 0,
                    path: file_path.as_bytes().to_vec(),
                };
                index.add(&index_entry)?;
            }
            Err(_) => {
                // File does not exist in HEAD (was newly added): remove from index.
                index.remove_path(file_p)?;
            }
        }
    }

    index.write()?;

    tracing::info!("Unstaged {} files in {}", file_paths.len(), path.display());
    Ok(())
}

/// Stage a specific hunk from a file (equivalent to staging a chunk in lazygit).
/// `hunk_index` is 0-based.
pub fn git_stage_hunk(path: &Path, file_path: &str, hunk_index: usize) -> Result<(), GitError> {
    let repo = Repository::open(path)?;

    // Get unstaged diff for this file (workdir vs index).
    let mut diff_opts = DiffOptions::new();
    diff_opts.pathspec(file_path);
    diff_opts.include_untracked(true);
    diff_opts.recurse_untracked_dirs(true);

    let diff = repo.diff_index_to_workdir(Some(&repo.index()?), Some(&mut diff_opts))?;

    // Find the patch for our file.
    let mut patch_opt = None;
    for i in 0..diff.deltas().len() {
        if let Ok(Some(p)) = git2::Patch::from_diff(&diff, i) {
            patch_opt = Some(p);
            break;
        }
    }

    let patch = patch_opt.ok_or_else(|| GitError::PathError("No patch found for file".to_string()))?;
    let num_hunks = patch.num_hunks();

    if hunk_index >= num_hunks {
        return Err(GitError::PathError(format!(
            "Hunk index {} out of range (file has {} hunks)",
            hunk_index, num_hunks
        )));
    }

    // Build a partial diff that includes only the requested hunk.
    // We need to reconstruct a valid unified diff with header + one hunk.
    let mut partial_diff = String::new();

    // Add the diff header.
    let delta = patch.delta();
    let old_path = delta.old_file().path().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();
    let new_path = delta.new_file().path().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();

    partial_diff.push_str(&format!("--- a/{}\n", old_path));
    partial_diff.push_str(&format!("+++ b/{}\n", new_path));

    // Get the specific hunk.
    let (hunk, _) = patch.hunk(hunk_index)?;
    partial_diff.push_str(&format!(
        "@@ -{},{} +{},{} @@\n",
        hunk.old_start(),
        hunk.old_lines(),
        hunk.new_start(),
        hunk.new_lines()
    ));

    // Add all lines from this hunk.
    let num_lines = patch.num_lines_in_hunk(hunk_index)?;
    for line_idx in 0..num_lines {
        let line = patch.line_in_hunk(hunk_index, line_idx)?;
        let origin = line.origin();
        if origin == '+' || origin == '-' || origin == ' ' {
            partial_diff.push(origin);
        }
        partial_diff.push_str(&String::from_utf8_lossy(line.content()));
    }

    // Parse the partial diff and apply to index.
    let partial_diff_obj = git2::Diff::from_buffer(partial_diff.as_bytes())?;

    // Apply to the index (staging area).
    repo.apply(&partial_diff_obj, git2::ApplyLocation::Index, None)?;

    tracing::info!(
        "Staged hunk {} of file {} in {}",
        hunk_index,
        file_path,
        path.display()
    );
    Ok(())
}

/// Create a git signature for commits.
fn make_signature<'a>() -> Result<Signature<'a>, git2::Error> {
    Signature::now("Kobo", "kobo@local")
}
