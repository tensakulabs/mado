import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { type FileDiff, gitStageFiles, gitUnstageFiles, gitCommit } from "../../lib/ipc";

interface CommitModalProps {
  /** Whether the modal is open. */
  isOpen: boolean;
  /** Close the modal. */
  onClose: () => void;
  /** Session ID for git operations. */
  sessionId: string;
  /** All changed files (staged + unstaged). */
  stagedFiles: FileDiff[];
  unstagedFiles: FileDiff[];
  /** Callback after successful commit. */
  onCommitComplete: () => void;
}

/** Status color dot matching existing FileList patterns. */
function statusColor(status: string): string {
  switch (status) {
    case "added":
      return "bg-green-500";
    case "deleted":
      return "bg-red-500";
    case "renamed":
      return "bg-blue-500";
    default:
      return "bg-yellow-500";
  }
}

/**
 * Modal dialog for committing changes.
 * Features: commit message textarea, file selection with checkboxes,
 * search/filter, and commit/cancel actions.
 */
export function CommitModal({
  isOpen,
  onClose,
  sessionId,
  stagedFiles,
  unstagedFiles,
  onCommitComplete,
}: CommitModalProps) {
  const [message, setMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // All files combined.
  const allFiles = useMemo(
    () => [...stagedFiles, ...unstagedFiles],
    [stagedFiles, unstagedFiles],
  );

  // Track selected file paths -- all checked by default.
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(
    () => new Set(allFiles.map((f) => f.path)),
  );

  // Sync selections when files change.
  useEffect(() => {
    setSelectedPaths(new Set(allFiles.map((f) => f.path)));
  }, [allFiles]);

  // Focus textarea when modal opens.
  useEffect(() => {
    if (isOpen) {
      // Small delay to let the modal render.
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Escape key closes modal.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen, onClose]);

  // Filtered files based on search query.
  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return allFiles;
    const query = searchQuery.toLowerCase();
    return allFiles.filter((f) => f.path.toLowerCase().includes(query));
  }, [allFiles, searchQuery]);

  const toggleFile = useCallback((path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedPaths((prev) => {
      const allSelected = filteredFiles.every((f) => prev.has(f.path));
      if (allSelected) {
        // Deselect all visible files.
        const next = new Set(prev);
        for (const f of filteredFiles) {
          next.delete(f.path);
        }
        return next;
      } else {
        // Select all visible files.
        const next = new Set(prev);
        for (const f of filteredFiles) {
          next.add(f.path);
        }
        return next;
      }
    });
  }, [filteredFiles]);

  const selectedCount = useMemo(
    () => allFiles.filter((f) => selectedPaths.has(f.path)).length,
    [allFiles, selectedPaths],
  );

  const canCommit = message.trim().length > 0 && selectedCount > 0 && !isCommitting;

  const handleCommit = useCallback(async () => {
    if (!canCommit) return;
    setIsCommitting(true);
    setError(null);

    try {
      // Determine which files need to be staged and which need to be unstaged.
      const stagedPathSet = new Set(stagedFiles.map((f) => f.path));

      // Files to stage: selected but not currently staged.
      const toStage = allFiles
        .filter((f) => selectedPaths.has(f.path) && !stagedPathSet.has(f.path))
        .map((f) => f.path);

      // Files to unstage: currently staged but not selected.
      const toUnstage = stagedFiles
        .filter((f) => !selectedPaths.has(f.path))
        .map((f) => f.path);

      // Execute staging operations.
      if (toStage.length > 0) {
        await gitStageFiles(sessionId, toStage);
      }
      if (toUnstage.length > 0) {
        await gitUnstageFiles(sessionId, toUnstage);
      }

      // Commit.
      await gitCommit(sessionId, message.trim());

      // Reset state and close.
      setMessage("");
      setSearchQuery("");
      onCommitComplete();
      onClose();
    } catch (err) {
      console.error("[CommitModal] Commit failed:", err);
      setError(String(err));
    } finally {
      setIsCommitting(false);
    }
  }, [canCommit, sessionId, message, allFiles, stagedFiles, selectedPaths, onCommitComplete, onClose]);

  // Ctrl/Cmd+Enter to commit.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleCommit();
      }
    },
    [handleCommit],
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 flex w-full max-w-lg flex-col overflow-hidden rounded-lg border border-theme-primary bg-theme-primary shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-theme-primary px-4 py-3">
          <h2 className="text-sm font-medium text-theme-primary">
            Commit Changes
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-theme-muted hover:bg-theme-tertiary hover:text-theme-primary"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
            </svg>
          </button>
        </div>

        {/* Commit message */}
        <div className="border-b border-theme-primary px-4 py-3">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Commit message..."
            rows={3}
            className="w-full resize-none rounded border border-theme-primary bg-theme-secondary px-3 py-2 font-mono text-xs text-theme-primary placeholder:text-theme-muted focus:border-blue-500 focus:outline-none"
          />
        </div>

        {/* File selection */}
        <div className="flex flex-col overflow-hidden">
          {/* Search + select all */}
          <div className="flex items-center gap-2 border-b border-theme-primary px-4 py-2">
            <button
              onClick={toggleAll}
              className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors ${
                filteredFiles.length > 0 && filteredFiles.every((f) => selectedPaths.has(f.path))
                  ? "border-green-500 bg-green-500/20 text-green-400"
                  : "border-theme-primary text-theme-muted hover:border-theme-secondary"
              }`}
              title="Toggle all"
            >
              {filteredFiles.length > 0 && filteredFiles.every((f) => selectedPaths.has(f.path)) && (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className="h-3 w-3"
                >
                  <path
                    fillRule="evenodd"
                    d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files..."
              className="flex-1 rounded border border-theme-primary bg-theme-secondary px-2 py-1 text-xs text-theme-primary placeholder:text-theme-muted focus:border-blue-500 focus:outline-none"
            />
            <span className="text-xs text-theme-muted">
              {selectedCount}/{allFiles.length}
            </span>
          </div>

          {/* File list */}
          <div className="max-h-48 overflow-y-auto px-2 py-1">
            {filteredFiles.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-theme-muted">
                {searchQuery ? "No files match search" : "No changed files"}
              </p>
            ) : (
              filteredFiles.map((file) => {
                const isChecked = selectedPaths.has(file.path);
                return (
                  <div
                    key={file.path}
                    onClick={() => toggleFile(file.path)}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors hover:bg-theme-tertiary"
                  >
                    {/* Checkbox */}
                    <div
                      className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors ${
                        isChecked
                          ? "border-green-500 bg-green-500/20 text-green-400"
                          : "border-theme-primary text-theme-muted"
                      }`}
                    >
                      {isChecked && (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 16 16"
                          fill="currentColor"
                          className="h-3 w-3"
                        >
                          <path
                            fillRule="evenodd"
                            d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </div>

                    {/* Status dot */}
                    <span
                      className={`h-2 w-2 flex-shrink-0 rounded-full ${statusColor(file.status)}`}
                    />

                    {/* File path */}
                    <span className="flex-1 truncate font-mono text-theme-primary">
                      {file.path}
                    </span>

                    {/* Stats */}
                    {(file.insertions > 0 || file.deletions > 0) && (
                      <span className="flex-shrink-0 font-mono text-theme-muted">
                        {file.insertions > 0 && (
                          <span className="text-green-500">+{file.insertions}</span>
                        )}
                        {file.deletions > 0 && (
                          <span className="text-red-500 ml-1">-{file.deletions}</span>
                        )}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Error display */}
        {error && (
          <div className="border-t border-red-900/30 bg-red-900/10 px-4 py-2">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center justify-between border-t border-theme-primary px-4 py-3">
          <span className="text-xs text-theme-muted">
            {selectedCount} file{selectedCount !== 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isCommitting}
              className="rounded px-3 py-1.5 text-xs text-theme-muted hover:bg-theme-tertiary hover:text-theme-primary disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleCommit}
              disabled={!canCommit}
              className={`rounded px-4 py-1.5 text-xs font-medium transition-colors ${
                canCommit
                  ? "bg-green-600 text-white hover:bg-green-500"
                  : "bg-theme-tertiary text-theme-muted cursor-not-allowed"
              }`}
              title="Commit selected changes (Ctrl+Enter)"
            >
              {isCommitting ? "Committing..." : "Commit"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
