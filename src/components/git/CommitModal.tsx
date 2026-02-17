import { useState, useCallback, useRef, useEffect } from "react";
import { gitStageFiles, gitCommit, gitPush } from "../../lib/ipc";

interface CommitModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  /** Current branch name. */
  branch: string;
  /** Whether an origin remote exists. */
  hasRemote: boolean;
  /** Total number of changed files. */
  fileCount: number;
  /** Total insertions across all files. */
  insertions: number;
  /** Total deletions across all files. */
  deletions: number;
  /** Paths of all changed files (staged + unstaged) to stage before commit. */
  filePaths: string[];
  /** Callback after successful commit (and optional push). */
  onCommitComplete: () => void;
}

/**
 * Centered modal for committing changes.
 * Shows branch, change summary, message fields, and context-aware action buttons.
 *
 * - No origin → "Save" button (commit only)
 * - Origin exists → "Commit" and "Commit & Push" buttons
 */
export function CommitModal({
  isOpen,
  onClose,
  sessionId,
  branch,
  hasRemote,
  fileCount,
  insertions,
  deletions,
  filePaths,
  onCommitComplete,
}: CommitModalProps) {
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus summary input when modal opens.
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Close on Escape.
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

  const handleCommit = useCallback(
    async (push: boolean) => {
      setIsCommitting(true);
      setError(null);

      try {
        // Stage all changed files.
        if (filePaths.length > 0) {
          await gitStageFiles(sessionId, filePaths);
        }

        // Build commit message.
        const summaryLine = summary.trim() || `Save ${new Date().toLocaleString()}`;
        const commitMessage = description.trim()
          ? `${summaryLine}\n\n${description.trim()}`
          : summaryLine;

        await gitCommit(sessionId, commitMessage);

        if (push) {
          await gitPush(sessionId);
        }

        setSummary("");
        setDescription("");
        onCommitComplete();
        onClose();
      } catch (err) {
        console.error("[CommitModal] Commit failed:", err);
        setError(String(err));
      } finally {
        setIsCommitting(false);
      }
    },
    [sessionId, summary, description, filePaths, onCommitComplete, onClose],
  );

  // Ctrl/Cmd+Enter to commit.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleCommit(false);
      }
    },
    [handleCommit],
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 flex w-full max-w-md flex-col overflow-hidden rounded-lg border border-theme-primary bg-theme-primary shadow-2xl">
        {/* Header — branch + change summary */}
        <div className="flex items-center justify-between border-b border-theme-primary px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Branch name */}
            <div className="flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 text-theme-muted">
                <path fillRule="evenodd" d="M9.487 2.763a.75.75 0 0 1 1.05.174l.009.012a.75.75 0 1 1-1.222.872l-.003-.004a.75.75 0 0 1 .166-1.054ZM12.5 5a2.5 2.5 0 0 1-2.457 2.498 6.511 6.511 0 0 1-.884 1.685A4 4 0 0 1 12 13H4a4 4 0 0 1 2.841-3.817 6.511 6.511 0 0 1-.884-1.685A2.501 2.501 0 0 1 5 2.5a2.5 2.5 0 0 1 5 0 2.5 2.5 0 0 1 2.5 2.5ZM8 9.519a5.036 5.036 0 0 1-1.078-.586A2.49 2.49 0 0 0 5.5 11.5h5a2.49 2.49 0 0 0-1.422-2.567A5.036 5.036 0 0 1 8 9.519Z" clipRule="evenodd" />
              </svg>
              <span className="text-xs font-medium text-theme-primary">{branch}</span>
            </div>
            {/* Change summary */}
            <span className="font-mono text-xs text-theme-muted">
              {fileCount} file{fileCount !== 1 ? "s" : ""}
              {" "}
              <span className="text-green-400">+{insertions}</span>
              {" "}
              <span className="text-red-400">-{deletions}</span>
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-theme-muted hover:bg-theme-tertiary hover:text-theme-primary"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
              <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
            </svg>
          </button>
        </div>

        {/* Summary + description */}
        <div className="px-4 py-3 space-y-2">
          <input
            ref={inputRef}
            type="text"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Summary (leave blank to auto-generate)"
            className="w-full rounded border border-theme-primary bg-theme-secondary px-3 py-2 font-mono text-xs text-theme-primary placeholder:text-theme-muted focus:border-blue-500 focus:outline-none"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Description (optional)"
            rows={2}
            className="w-full resize-none rounded border border-theme-primary bg-theme-secondary px-3 py-2 font-mono text-xs text-theme-primary placeholder:text-theme-muted focus:border-blue-500 focus:outline-none"
          />
        </div>

        {/* Error display */}
        {error && (
          <div className="border-t border-red-900/30 bg-red-900/10 px-4 py-2">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-2 border-t border-theme-primary px-4 py-3">
          <button
            onClick={onClose}
            disabled={isCommitting}
            className="rounded px-3 py-1.5 text-xs text-theme-muted hover:bg-theme-tertiary hover:text-theme-primary disabled:opacity-50"
          >
            Cancel
          </button>
          {hasRemote ? (
            <>
              <button
                onClick={() => handleCommit(false)}
                disabled={isCommitting}
                className={`rounded px-4 py-1.5 text-xs font-medium transition-colors ${
                  isCommitting
                    ? "bg-theme-tertiary text-theme-muted cursor-not-allowed"
                    : "border border-green-700/50 text-green-400 hover:border-green-500 hover:bg-green-900/30"
                }`}
              >
                {isCommitting ? "..." : "Commit"}
              </button>
              <button
                onClick={() => handleCommit(true)}
                disabled={isCommitting}
                className={`rounded px-4 py-1.5 text-xs font-medium transition-colors ${
                  isCommitting
                    ? "bg-theme-tertiary text-theme-muted cursor-not-allowed"
                    : "bg-green-600 text-white hover:bg-green-500"
                }`}
              >
                {isCommitting ? "Pushing..." : "Commit & Push"}
              </button>
            </>
          ) : (
            <button
              onClick={() => handleCommit(false)}
              disabled={isCommitting}
              className={`rounded px-4 py-1.5 text-xs font-medium transition-colors ${
                isCommitting
                  ? "bg-theme-tertiary text-theme-muted cursor-not-allowed"
                  : "bg-green-600 text-white hover:bg-green-500"
              }`}
            >
              {isCommitting ? "Saving..." : "Save"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
