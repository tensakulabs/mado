# Swarm Execution Pattern

## Overview

Multi-track parallel execution using git worktrees for isolation. Each track runs independently with its own feature branch and working directory.

## Architecture

```
Main Repo: /Users/justintieu/tensakulabs/mado
     │
     └── .mado-swarm/           (worktree container)
           ├── session-management/   → feature/session-management
           ├── ui-polish/            → feature/ui-polish
           ├── git-staging-ux/       → feature/git-staging-ux
           ├── grid-layout/          → feature/grid-layout
           └── diff-view/            → feature/diff-view
```

## Tracks Executed

### Track A: Session Management
**Branch:** `feature/session-management`
**Agent:** ae87822 (Engineer)
**Deliverables:**
- Delete sessions to trash (`~/.mado/trash/` with manifest)
- Mado name map (session renames in `~/.mado/session-names/`)
- Filter empty sessions (messageCount == 0)
- Deduplicate session names (numeric suffix)
- Optimistic UI removal

### Track B: UI Polish
**Branch:** `feature/ui-polish`
**Agent:** af78782 (Engineer)
**Deliverables:**
- TruncatedText component with hover tooltips
- Resizable sidebar with drag handle (200-480px)
- Width persistence to localStorage
- Window size defaults (1600x1000, min 900x640)

### Track C: Git Staging UX
**Branch:** `feature/git-staging-ux`
**Agent:** a5f8471 (Engineer)
**Deliverables:**
- CommitModal with file checkboxes and search filter
- Selective file staging in git_commit
- git_diff_stat and git_log commands
- FileStatusEntry with staged/unstaged fields
- Save button with green change indicator

### Track D: Grid Layout
**Branch:** `feature/grid-layout`
**Agent:** afa1010 (Engineer)
**Deliverables:**
- useGridLayout hook with localStorage persistence
- GridResizePopup with presets (15/30/40/50%) and custom slider
- Dynamic sidebar width via CSS variable
- Visual preview bars for layout options

### Track E: Diff View
**Branch:** `feature/diff-view`
**Agent:** a55923d (Engineer)
**Deliverables:**
- DiffView component with color-coded lines
- DiffFullscreen modal (Radix Dialog)
- Truncation tooltips (only when content truncated)
- isDiffContent() detection (language tag + heuristic)

## Worktree Setup Commands

```bash
# Create swarm directory
mkdir -p ~/.mado-swarm

# Create worktrees for each track
cd /path/to/main-repo
git worktree add ../.mado-swarm/session-management -b feature/session-management
git worktree add ../.mado-swarm/ui-polish -b feature/ui-polish
git worktree add ../.mado-swarm/git-staging-ux -b feature/git-staging-ux
git worktree add ../.mado-swarm/grid-layout -b feature/grid-layout
git worktree add ../.mado-swarm/diff-view -b feature/diff-view

# Install dependencies in each worktree
for dir in ~/.mado-swarm/*/; do
  (cd "$dir" && pnpm install)
done
```

## Agent Spawning Pattern

```typescript
// Spawn 5 parallel Engineer agents, one per track
Task(prompt="...", subagent_type="Engineer", description="Track A EM: Session Management")
Task(prompt="...", subagent_type="Engineer", description="Track B EM: UI Polish")
Task(prompt="...", subagent_type="Engineer", description="Track C EM: Git Staging UX")
Task(prompt="...", subagent_type="Engineer", description="Track D EM: Grid Layout")
Task(prompt="...", subagent_type="Engineer", description="Track E EM: Diff View")
```

Each agent:
1. Works in its own worktree directory
2. Makes atomic commits to its feature branch
3. Reports completion with summary
4. All run in parallel (5 simultaneous contexts)

## Post-Swarm Merge

```bash
# After all tracks complete, merge to main
git checkout main
git merge feature/session-management
git merge feature/ui-polish
git merge feature/git-staging-ux
git merge feature/grid-layout
git merge feature/diff-view

# Clean up worktrees
git worktree remove ~/.mado-swarm/session-management
git worktree remove ~/.mado-swarm/ui-polish
git worktree remove ~/.mado-swarm/git-staging-ux
git worktree remove ~/.mado-swarm/grid-layout
git worktree remove ~/.mado-swarm/diff-view
```

## Key Principles

1. **Worktree isolation** — Each track has its own filesystem, no conflicts
2. **Feature branches** — Clean git history, easy to revert individual tracks
3. **Parallel execution** — All 5 tracks run simultaneously
4. **Atomic commits** — Each track commits independently
5. **Quality gates** — Each track runs build/tests before reporting complete
6. **Summary reports** — Each agent provides structured completion summary

## Agent Count

- **5 Track Agents** (parallel, Engineer type)
- **N Sub-tasks per track** (sequential within track)
- **Total agent calls:** Varies by track complexity

The "18 agents" likely refers to the combined sub-task executions across all tracks, where each track spawned multiple tool calls and sub-operations.

---

*Recovered from session: 2026-02-16*
*Adapted for Mado from deprecated Kobo swarm execution*
