import { useState, useCallback, useRef, useEffect } from "react";
import { Tooltip } from "../Tooltip";

interface CommitPanelProps {
  stagedCount: number;
  onCommit: (message: string) => void;
  disabled: boolean;
}

/**
 * Bottom panel of the GitView with commit message textarea
 * and commit button. Disabled when no staged files or empty message.
 */
export function CommitPanel({ stagedCount, onCommit, disabled }: CommitPanelProps) {
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canCommit = !disabled && stagedCount > 0 && message.trim().length > 0;

  const handleCommit = useCallback(() => {
    if (!canCommit) return;
    onCommit(message.trim());
    setMessage("");
  }, [canCommit, message, onCommit]);

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

  // Focus textarea when panel becomes enabled.
  useEffect(() => {
    if (!disabled && stagedCount > 0) {
      textareaRef.current?.focus();
    }
  }, [disabled, stagedCount]);

  return (
    <div className="flex-shrink-0 border-t border-theme-primary bg-theme-primary">
      <div className="flex items-center gap-3 p-3">
        {/* Commit message input */}
        <div className="flex-1">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              stagedCount === 0
                ? "Stage files to enable commit..."
                : "Commit message..."
            }
            disabled={disabled || stagedCount === 0}
            rows={2}
            className="w-full resize-none rounded border border-theme-primary bg-theme-secondary px-3 py-2 font-mono text-xs text-theme-primary placeholder:text-theme-muted focus:border-blue-500 focus:outline-none disabled:opacity-50"
          />
        </div>

        {/* Right side: info + button */}
        <div className="flex flex-col items-end gap-2">
          {/* Staged count */}
          <span className="text-xs text-theme-muted">
            {stagedCount} file{stagedCount !== 1 ? "s" : ""} staged
          </span>

          {/* Commit button */}
          <Tooltip content="Commit staged changes (Ctrl+Enter)">
            <button
              onClick={handleCommit}
              disabled={!canCommit}
              className={`rounded px-4 py-1.5 text-xs font-medium transition-colors ${
                canCommit
                  ? "bg-green-600 text-white hover:bg-green-500"
                  : "bg-theme-tertiary text-theme-muted cursor-not-allowed"
              }`}
            >
              Commit
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
