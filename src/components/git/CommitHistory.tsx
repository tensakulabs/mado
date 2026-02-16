import { useState, useEffect, useCallback } from "react";
import { type GitLogEntry, gitLog } from "../../lib/ipc";

interface CommitHistoryProps {
  /** Session ID for git operations. */
  sessionId: string;
  /** Maximum number of commits to show. Defaults to 20. */
  limit?: number;
}

/**
 * Simple commit log viewer showing recent commits.
 * Displays OID (short hash), message, author, and timestamp.
 */
export function CommitHistory({ sessionId, limit = 20 }: CommitHistoryProps) {
  const [entries, setEntries] = useState<GitLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const log = await gitLog(sessionId, limit);
      setEntries(log);
    } catch (err) {
      console.error("[CommitHistory] Failed to fetch git log:", err);
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, limit]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** Format a timestamp to a relative or short date string. */
  function formatTimestamp(ts: string): string {
    try {
      const date = new Date(ts);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMin < 1) return "just now";
      if (diffMin < 60) return `${diffMin}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;

      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    } catch {
      return ts;
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-theme-secondary">
        <p className="text-xs text-theme-muted">Loading commit history...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-theme-secondary">
        <p className="text-xs text-red-400">Failed to load commit history</p>
        <button
          onClick={refresh}
          className="rounded px-2 py-1 text-xs text-theme-muted hover:bg-theme-tertiary hover:text-theme-primary"
        >
          Retry
        </button>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-theme-secondary">
        <p className="text-xs text-theme-muted">No commits yet</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-theme-secondary">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-theme-primary bg-theme-primary px-3 py-2">
        <span className="text-xs font-medium text-theme-secondary">
          Commit History
        </span>
        <button
          onClick={refresh}
          className="rounded p-1 text-theme-muted hover:bg-theme-tertiary hover:text-theme-primary"
          title="Refresh"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="h-3 w-3"
          >
            <path
              fillRule="evenodd"
              d="M13.836 2.477a.75.75 0 0 1 .75.75v3.182a.75.75 0 0 1-.75.75h-3.182a.75.75 0 0 1 0-1.5h1.37l-.84-.841a4.5 4.5 0 0 0-7.08.681.75.75 0 0 1-1.3-.75 6 6 0 0 1 9.44-.908l.84.84V3.227a.75.75 0 0 1 .75-.75Zm-.911 7.5A.75.75 0 0 1 13.199 11a6 6 0 0 1-9.44.908l-.84-.84v1.836a.75.75 0 0 1-1.5 0V9.723a.75.75 0 0 1 .75-.75h3.182a.75.75 0 0 1 0 1.5H3.98l.841.841a4.5 4.5 0 0 0 7.08-.681.75.75 0 0 1 1.025-.274Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      {/* Commit list */}
      <div className="flex-1 overflow-y-auto">
        {entries.map((entry) => (
          <div
            key={entry.oid}
            className="border-b border-theme-primary px-3 py-2 transition-colors hover:bg-theme-tertiary"
          >
            <div className="flex items-start justify-between gap-2">
              {/* Commit message */}
              <p className="flex-1 text-xs text-theme-primary leading-relaxed">
                {entry.message.split("\n")[0]}
              </p>
              {/* Timestamp */}
              <span className="flex-shrink-0 text-xs text-theme-muted">
                {formatTimestamp(entry.timestamp)}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              {/* Short hash */}
              <code className="rounded bg-theme-tertiary px-1.5 py-0.5 text-xs font-mono text-blue-400">
                {entry.oid.slice(0, 7)}
              </code>
              {/* Author */}
              <span className="text-xs text-theme-muted">
                {entry.author}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
