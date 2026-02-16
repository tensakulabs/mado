import { useEffect, useMemo, useCallback } from "react";
import { useSessionStore } from "../stores/sessions";
import { useUiStore } from "../stores/ui";
import { usePaneStore } from "../stores/panes";

/**
 * Left sidebar listing all sessions for the current workspace.
 * Sessions are sorted newest-first by updated_at.
 * Clicking a session replaces the active pane's session.
 */
export function SessionSidebar() {
  const sessions = useSessionStore((s) => s.sessions);
  const fetchSessions = useSessionStore((s) => s.fetchSessions);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const activePaneId = usePaneStore((s) => s.activePaneId);
  const replaceSession = usePaneStore((s) => s.replaceSession);
  const getLeaves = usePaneStore((s) => s.getLeaves);

  // Determine the current session from the active pane.
  const currentSessionId = useMemo(() => {
    const leaves = getLeaves();
    const activeLeaf = leaves.find((l) => l.id === activePaneId);
    return activeLeaf?.sessionId;
  }, [getLeaves, activePaneId]);

  // Determine the working directory of the current session.
  const currentWorkingDir = useMemo(() => {
    if (!currentSessionId) return undefined;
    const session = sessions.find((s) => s.id === currentSessionId);
    return session?.working_dir;
  }, [currentSessionId, sessions]);

  // Filter and sort sessions: same workspace, newest first.
  const filteredSessions = useMemo(() => {
    const filtered = sessions.filter((s) => {
      // If current session has a working_dir, show sessions with the same dir.
      // If no working_dir, show sessions that also have no working_dir.
      if (currentWorkingDir) {
        return s.working_dir === currentWorkingDir;
      }
      return !s.working_dir;
    });

    // Sort by updated_at descending (newest first).
    return [...filtered].sort((a, b) => {
      const dateA = new Date(a.updated_at).getTime();
      const dateB = new Date(b.updated_at).getTime();
      return dateB - dateA;
    });
  }, [sessions, currentWorkingDir]);

  // Refresh sessions list when sidebar opens.
  useEffect(() => {
    if (sidebarOpen) {
      fetchSessions();
    }
  }, [sidebarOpen, fetchSessions]);

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      if (!activePaneId) return;
      if (sessionId === currentSessionId) return; // Already active.
      replaceSession(activePaneId, sessionId);
    },
    [activePaneId, currentSessionId, replaceSession],
  );

  const formatTimestamp = (ts: string) => {
    try {
      const date = new Date(ts);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);

      if (minutes < 1) return "just now";
      if (minutes < 60) return `${minutes}m ago`;
      if (hours < 24) return `${hours}h ago`;
      if (days < 7) return `${days}d ago`;
      return date.toLocaleDateString();
    } catch {
      return ts;
    }
  };

  // Hide sidebar entirely when no active session (e.g., workspace selection).
  if (!currentSessionId) {
    return null;
  }

  if (!sidebarOpen) {
    // Collapsed state: just show the toggle button.
    return (
      <div className="flex flex-col items-center border-r border-theme-primary bg-theme-secondary py-2">
        <button
          onClick={toggleSidebar}
          className="rounded p-1.5 text-theme-muted hover:bg-theme-tertiary hover:text-theme-secondary"
          title="Show sessions (Ctrl+B s)"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <line x1="3" y1="4" x2="13" y2="4" />
            <line x1="3" y1="8" x2="13" y2="8" />
            <line x1="3" y1="12" x2="13" y2="12" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-56 flex-shrink-0 flex-col border-r border-theme-primary bg-theme-secondary">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-theme-primary px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wider text-theme-muted">
          Sessions
        </span>
        <button
          onClick={toggleSidebar}
          className="rounded p-1 text-theme-muted hover:bg-theme-tertiary hover:text-theme-secondary"
          title="Hide sidebar"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <line x1="2" y1="7" x2="12" y2="7" />
            <polyline points="6,3 2,7 6,11" />
          </svg>
        </button>
      </div>

      {/* Workspace label */}
      {currentWorkingDir && (
        <div className="border-b border-theme-primary px-3 py-1.5">
          <span className="text-xs text-theme-muted">
            {currentWorkingDir.split("/").pop() || "workspace"}
          </span>
        </div>
      )}

      {/* Session list */}
      <div className="flex-1 overflow-y-auto py-1">
        {filteredSessions.length === 0 && (
          <div className="px-3 py-4 text-center text-xs text-theme-muted">
            No sessions in this workspace
          </div>
        )}

        {filteredSessions.map((session) => {
          const isActive = session.id === currentSessionId;
          return (
            <button
              key={session.id}
              onClick={() => handleSelectSession(session.id)}
              className={`group flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors ${
                isActive
                  ? "bg-blue-900/30 text-theme-secondary"
                  : "text-theme-muted hover:bg-theme-tertiary hover:text-theme-secondary"
              }`}
            >
              <div className="flex items-center gap-2">
                {isActive && (
                  <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-400" />
                )}
                <span className="truncate text-sm">
                  {session.name}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-theme-muted">
                <span>{formatTimestamp(session.updated_at)}</span>
                {session.message_count > 0 && (
                  <span>
                    {session.message_count} msg{session.message_count !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
