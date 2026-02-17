# Phase 7: Git View — SWARM Execution Plan

## Overview

Lazygit-style interface for staging, diffs, and commits directly from Mado UI.

**Execution Mode:** SWARM (parallel agents)

## Plans

### Wave 1 (Parallel)

**07-01: Backend Git IPC Commands**
- `git_status` — staged/unstaged file list with stats
- `git_diff` — file diff with line-by-line output
- `git_add` — stage file(s)
- `git_reset` — unstage file(s)
- `git_commit` — commit with message

**07-02: GitView Component**
- File list panel (staged/unstaged sections)
- Diff viewer with syntax highlighting
- Keyboard navigation (j/k, space to stage/unstage)
- Back button / Escape to return to chat

### Wave 2 (Sequential, depends on Wave 1)

**07-03: Staging Controls & Commit UI**
- Stage/unstage individual files
- Stage/unstage individual hunks (optional)
- Commit message input
- Commit button with validation

## Success Criteria

1. User clicks [+ -] indicator → full-screen git view
2. User selects file → sees diff (added/removed lines, syntax highlighting)
3. User can stage/unstage individual files
4. User can write commit message and commit from UI
5. Escape returns to chat view

## Swarm Agent Assignment

| Plan | Agent | Dependency |
|------|-------|------------|
| 07-01 | Engineer (backend) | None |
| 07-02 | Engineer (frontend) | None |
| 07-03 | Engineer (full-stack) | 07-01 + 07-02 |

## Execution Command

```bash
# From Mado project root
/gsd:execute-phase 7
```

GSD will detect SWARM mode and spawn 07-01 + 07-02 in parallel.

---

## Progress (from previous session)

Some work was completed:
- Backend git staging operations (partial)
- Frontend GitView components (partial)
- Frontend git IPC commands (partial)
- GitView integration wiring (partial)

**Status:** Needs verification of what's complete vs what remains.
