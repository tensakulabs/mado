import { useState, useEffect, useCallback } from "react";
import {
  type FileDiff,
  gitStatus,
  gitFileDiff,
  gitStageFile,
  gitUnstageFile,
  gitStageFiles,
  gitUnstageFiles,
  gitStageHunk,
  gitCommit,
} from "../lib/ipc";
import { FileList } from "./git/FileList";
import { DiffViewer } from "./git/DiffViewer";
import { CommitPanel } from "./git/CommitPanel";

interface GitViewProps {
  sessionId: string;
  onClose: () => void;
}

/**
 * Full-screen lazygit-style git view.
 * Three-panel layout: FileList (left), DiffViewer (center), CommitPanel (bottom).
 * Replaces the chat view when active.
 *
 * State management is done here; child components are pure presentational.
 */
export function GitView({ sessionId, onClose }: GitViewProps) {
  const [staged, setStaged] = useState<FileDiff[]>([]);
  const [unstaged, setUnstaged] = useState<FileDiff[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedFileIsStaged, setSelectedFileIsStaged] = useState(false);
  const [currentDiff, setCurrentDiff] = useState<string | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "tree">("list");

  // Escape key closes the git view.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Fetch git status from backend.
  const refreshStatus = useCallback(async () => {
    try {
      const status = await gitStatus(sessionId);
      setStaged(status.staged);
      setUnstaged(status.unstaged);
      setError(null);
    } catch (err) {
      console.error("[GitView] Failed to fetch git status:", err);
      setError(String(err));
    }
  }, [sessionId]);

  // Load status on mount.
  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Fetch diff content when a file is selected.
  useEffect(() => {
    if (!selectedFile) {
      setCurrentDiff(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const diff = await gitFileDiff(sessionId, selectedFile, selectedFileIsStaged);
        if (!cancelled) {
          setCurrentDiff(diff);
        }
      } catch (err) {
        console.error("[GitView] Failed to fetch diff:", err);
        if (!cancelled) {
          setCurrentDiff(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedFile, selectedFileIsStaged, sessionId]);

  const handleSelectFile = useCallback(
    (path: string) => {
      setSelectedFile(path);
      // Determine if this file is in the staged list.
      const isStaged = staged.some((f) => f.path === path);
      setSelectedFileIsStaged(isStaged);
    },
    [staged],
  );

  const handleStageFile = useCallback(
    async (path: string) => {
      try {
        await gitStageFile(sessionId, path);
        await refreshStatus();
        // If the selected file was just staged, update its staged status.
        if (selectedFile === path) {
          setSelectedFileIsStaged(true);
        }
      } catch (err) {
        console.error("[GitView] Failed to stage file:", err);
      }
    },
    [sessionId, refreshStatus, selectedFile],
  );

  const handleUnstageFile = useCallback(
    async (path: string) => {
      try {
        await gitUnstageFile(sessionId, path);
        await refreshStatus();
        // If the selected file was just unstaged, update its staged status.
        if (selectedFile === path) {
          setSelectedFileIsStaged(false);
        }
      } catch (err) {
        console.error("[GitView] Failed to unstage file:", err);
      }
    },
    [sessionId, refreshStatus, selectedFile],
  );

  const handleCommit = useCallback(
    async (message: string) => {
      if (staged.length === 0 || !message.trim()) return;
      setIsCommitting(true);
      try {
        await gitCommit(sessionId, message);
        // After successful commit, refresh status to clear staged files.
        await refreshStatus();
        setSelectedFile(null);
        setCurrentDiff(null);
      } catch (err) {
        console.error("[GitView] Commit failed:", err);
        setError(String(err));
      } finally {
        setIsCommitting(false);
      }
    },
    [staged, sessionId, refreshStatus],
  );

  const handleStageAll = useCallback(async () => {
    try {
      // Stage all unstaged files in a single batch operation.
      await gitStageFiles(sessionId, unstaged.map((f) => f.path));
      await refreshStatus();
    } catch (err) {
      console.error("[GitView] Failed to stage all:", err);
    }
  }, [sessionId, unstaged, refreshStatus]);

  const handleUnstageAll = useCallback(async () => {
    try {
      // Unstage all staged files in a single batch operation.
      await gitUnstageFiles(sessionId, staged.map((f) => f.path));
      await refreshStatus();
    } catch (err) {
      console.error("[GitView] Failed to unstage all:", err);
    }
  }, [sessionId, staged, refreshStatus]);

  const handleStageHunk = useCallback(
    async (hunkIndex: number) => {
      if (!selectedFile) return;
      try {
        await gitStageHunk(sessionId, selectedFile, hunkIndex);
        await refreshStatus();
        // Re-fetch the diff for this file (it may have changed).
        const newDiff = await gitFileDiff(sessionId, selectedFile, false);
        setCurrentDiff(newDiff);
      } catch (err) {
        console.error("[GitView] Failed to stage hunk:", err);
        setError(String(err));
      }
    },
    [sessionId, selectedFile, refreshStatus],
  );

  return (
    <div className="flex h-full w-full flex-col bg-theme-primary">
      {/* Top bar with title and close button */}
      <div className="flex items-center justify-between border-b border-theme-primary bg-theme-primary px-3 py-1.5">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="rounded px-2 py-0.5 text-xs text-theme-muted hover:bg-theme-tertiary hover:text-theme-primary"
            title="Close Git View (Escape)"
          >
            &larr; Back
          </button>
          <span className="text-xs font-medium text-theme-secondary">
            Git Changes
          </span>
          {/* List/Tree view toggle */}
          <button
            onClick={() => setViewMode(viewMode === "list" ? "tree" : "list")}
            className="flex items-center justify-center rounded p-1 text-theme-muted hover:bg-theme-tertiary hover:text-theme-primary"
            title={viewMode === "list" ? "Switch to tree view" : "Switch to list view"}
          >
            {viewMode === "list" ? (
              // List icon
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                <path fillRule="evenodd" d="M2.5 4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5Zm0 4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5Zm0 4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5Z" clipRule="evenodd" />
              </svg>
            ) : (
              // Tree icon
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                <path fillRule="evenodd" d="M1 3.5A1.5 1.5 0 0 1 2.5 2h3A1.5 1.5 0 0 1 7 3.5v1A1.5 1.5 0 0 1 5.5 6H5v1h3.5A1.5 1.5 0 0 1 10 8.5v1a1.5 1.5 0 0 1-1.5 1.5H8v1h2.5a1.5 1.5 0 0 1 1.5 1.5v1a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 6 13.5v-1A1.5 1.5 0 0 1 7.5 11H8v-1H5.5A1.5 1.5 0 0 1 4 8.5v-1A1.5 1.5 0 0 1 5.5 6H5V5h-.5A1.5 1.5 0 0 1 3 3.5v-1Z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs text-theme-muted">
          {error && (
            <span className="text-red-400 mr-2" title={error}>
              Error loading status
            </span>
          )}
          <span>
            {staged.length + unstaged.length} file
            {staged.length + unstaged.length !== 1 ? "s" : ""} changed
          </span>
        </div>
      </div>

      {/* Main three-panel area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: File list (fixed width) */}
        <div className="w-72 flex-shrink-0">
          <FileList
            staged={staged}
            unstaged={unstaged}
            selectedFile={selectedFile}
            viewMode={viewMode}
            onSelectFile={handleSelectFile}
            onStageFile={handleStageFile}
            onUnstageFile={handleUnstageFile}
            onStageAll={handleStageAll}
            onUnstageAll={handleUnstageAll}
          />
        </div>

        {/* Center + Bottom: Diff viewer and commit panel */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Center: Diff viewer */}
          <div className="flex-1 overflow-hidden">
            <DiffViewer
              diff={currentDiff}
              fileName={selectedFile}
              isStaged={selectedFileIsStaged}
              insertions={
                selectedFile
                  ? (selectedFileIsStaged
                      ? staged.find((f) => f.path === selectedFile)?.insertions
                      : unstaged.find((f) => f.path === selectedFile)?.insertions) ?? 0
                  : 0
              }
              deletions={
                selectedFile
                  ? (selectedFileIsStaged
                      ? staged.find((f) => f.path === selectedFile)?.deletions
                      : unstaged.find((f) => f.path === selectedFile)?.deletions) ?? 0
                  : 0
              }
              onStageHunk={handleStageHunk}
            />
          </div>

          {/* Bottom: Commit panel */}
          <CommitPanel
            stagedCount={staged.length}
            onCommit={handleCommit}
            disabled={isCommitting}
          />
        </div>
      </div>
    </div>
  );
}
