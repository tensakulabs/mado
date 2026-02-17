import { useEffect, useMemo, useCallback, useState, useRef } from "react";
import { useSessionStore } from "../stores/sessions";
import { usePaneStore } from "../stores/panes";
import { ConfirmDialog } from "./ui/confirm-dialog";
import { Tooltip } from "./Tooltip";
import { getSessionName, setSessionName } from "../lib/session-names";

interface SessionSidebarProps {
  paneId: string;
  sessionId: string;
  onClose: () => void;
}

/**
 * Per-pane sidebar listing all sessions for the pane's workspace.
 * Sessions are sorted newest-first by updated_at.
 * Clicking a session replaces the pane's session.
 *
 * Features:
 * - Delete sessions with confirmation dialog
 * - Click session name to rename (localStorage-backed)
 * - Filter out empty sessions (message_count === 0) unless active
 * - Session name deduplication handled by the store
 */
export function SessionSidebar({ paneId, sessionId, onClose }: SessionSidebarProps) {
  const sessions = useSessionStore((s) => s.sessions);
  const cliSessions = useSessionStore((s) => s.cliSessions);
  const fetchSessions = useSessionStore((s) => s.fetchSessions);
  const fetchCliSessions = useSessionStore((s) => s.fetchCliSessions);
  const destroySession = useSessionStore((s) => s.destroySession);
  const createSession = useSessionStore((s) => s.createSession);
  const replaceSession = usePaneStore((s) => s.replaceSession);

  // State for delete confirmation dialog.
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // State for inline rename.
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(
    null,
  );
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Force re-render when custom names change (localStorage is not reactive).
  const [nameVersion, setNameVersion] = useState(0);

  // Use the session from props directly.
  const currentSessionId = sessionId;

  // Determine the working directory of the current session.
  const currentWorkingDir = useMemo(() => {
    const session = sessions.find((s) => s.id === currentSessionId);
    return session?.working_dir;
  }, [currentSessionId, sessions]);

  // Unified session type for single-list rendering.
  type UnifiedSession = {
    id: string;
    kind: "mado" | "cli";
    name: string;
    timestamp: number; // ms since epoch for sorting
    timestampStr: string;
    messageCount: number;
    isActive: boolean;
  };

  // Merge Mado sessions + CLI sessions into one sorted list.
  const unifiedSessions = useMemo(() => {
    const items: UnifiedSession[] = [];

    // Add Mado sessions (workspace-filtered).
    for (const s of sessions) {
      if (currentWorkingDir) {
        if (s.working_dir !== currentWorkingDir) continue;
      } else {
        if (s.working_dir) continue;
      }
      // Filter out empty sessions unless active.
      if (s.message_count === 0 && s.id !== currentSessionId) continue;

      items.push({
        id: s.id,
        kind: "mado",
        name: s.name,
        timestamp: new Date(s.updated_at).getTime(),
        timestampStr: s.updated_at,
        messageCount: s.message_count,
        isActive: s.id === currentSessionId,
      });
    }

    // Add CLI sessions (exclude duplicates already tracked by a Mado session).
    const madoClaudeIds = new Set(
      sessions.map((s) => s.claude_session_id).filter(Boolean),
    );
    for (const cs of cliSessions) {
      if (madoClaudeIds.has(cs.id)) continue;
      items.push({
        id: cs.id,
        kind: "cli",
        name: getSessionName(cs.id) ?? cs.id.slice(0, 8),
        timestamp: cs.modified ? new Date(cs.modified).getTime() : 0,
        timestampStr: cs.modified ?? "",
        messageCount: cs.message_count,
        isActive: false,
      });
    }

    // Sort newest first.
    items.sort((a, b) => b.timestamp - a.timestamp);
    return items;
  }, [sessions, cliSessions, currentWorkingDir, currentSessionId, nameVersion]);

  // Refresh sessions list on mount and when working directory changes.
  useEffect(() => {
    fetchSessions();
    if (currentWorkingDir) {
      fetchCliSessions(currentWorkingDir);
    }
  }, [fetchSessions, fetchCliSessions, currentWorkingDir]);

  // Focus the rename input when it appears.
  useEffect(() => {
    if (renamingSessionId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingSessionId]);

  // --- Delete handlers ---

  const handleDeleteClick = useCallback(
    (e: React.MouseEvent, sessionId: string, sessionName: string) => {
      e.stopPropagation(); // Don't select the session.
      setDeleteTarget({ id: sessionId, name: sessionName });
    },
    [],
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    setDeleteTarget(null);
    try {
      await destroySession(id);
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  }, [deleteTarget, destroySession]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteTarget(null);
  }, []);

  // --- Rename handlers ---

  const handleNameClick = useCallback(
    (e: React.MouseEvent, sessionId: string, currentName: string) => {
      e.stopPropagation(); // Don't select/switch the session.
      setRenamingSessionId(sessionId);
      setRenameValue(currentName);
    },
    [],
  );

  const commitRename = useCallback(() => {
    if (!renamingSessionId) return;
    setSessionName(renamingSessionId, renameValue);
    setRenamingSessionId(null);
    setRenameValue("");
    setNameVersion((v) => v + 1); // Trigger re-render.
  }, [renamingSessionId, renameValue]);

  const cancelRename = useCallback(() => {
    setRenamingSessionId(null);
    setRenameValue("");
  }, []);

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitRename();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelRename();
      }
    },
    [commitRename, cancelRename],
  );

  /** Get display name: custom name from localStorage, or fall back to session.name. */
  const getDisplayName = useCallback(
    (sessionId: string, fallback: string) => {
      // nameVersion dependency ensures reactivity on rename.
      void nameVersion;
      return getSessionName(sessionId) ?? fallback;
    },
    [nameVersion],
  );

  // Handle clicking any session — Mado sessions switch directly, CLI sessions reuse or create.
  const handleSelectUnified = useCallback(
    async (item: UnifiedSession) => {
      if (item.isActive) return;

      if (item.kind === "mado") {
        replaceSession(paneId, item.id);
      } else {
        // CLI session — check if a Mado session already tracks this Claude session.
        const existing = sessions.find(
          (s) => s.claude_session_id === item.id,
        );
        if (existing) {
          replaceSession(paneId, existing.id);
          return;
        }

        // No existing Mado session — create one.
        if (!currentWorkingDir) return;
        try {
          const session = await createSession(
            getSessionName(item.id) ?? item.id.slice(0, 8),
            "sonnet",
            24,
            80,
            currentWorkingDir,
          );
          replaceSession(paneId, session.id);
        } catch (err) {
          console.error("Failed to open CLI session:", err);
        }
      }
    },
    [paneId, currentWorkingDir, sessions, createSession, replaceSession],
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

  return (
    <div className="flex h-full flex-shrink-0 flex-col border-r border-theme-primary bg-theme-secondary" style={{ width: "var(--sidebar-width, 14rem)" }}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-theme-primary px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wider text-theme-muted">
          Sessions
        </span>
        <Tooltip content="Hide sidebar">
          <button
            onClick={onClose}
            className="rounded p-1 text-theme-muted hover:bg-theme-tertiary hover:text-theme-secondary"
            aria-label="Hide sidebar"
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
        </Tooltip>
      </div>

      {/* Workspace label */}
      {currentWorkingDir && (
        <div className="border-b border-theme-primary px-3 py-1.5">
          <span className="text-xs text-theme-muted">
            {currentWorkingDir.split("/").pop() || "workspace"}
          </span>
        </div>
      )}

      {/* Unified session list */}
      <div className="flex-1 overflow-y-auto py-1">
        {unifiedSessions.length === 0 && (
          <div className="px-3 py-4 text-center text-xs text-theme-muted">
            No sessions in this workspace
          </div>
        )}

        {unifiedSessions.map((item) => {
          const displayName = getDisplayName(item.id, item.name);
          const isRenaming = renamingSessionId === item.id;

          return (
            <div
              key={`${item.kind}-${item.id}`}
              onClick={() => handleSelectUnified(item)}
              className={`group flex w-full cursor-pointer flex-col gap-0.5 px-3 py-2 text-left transition-colors ${
                item.isActive
                  ? "bg-blue-900/30 text-theme-secondary"
                  : "text-theme-muted hover:bg-theme-tertiary hover:text-theme-secondary"
              }`}
            >
              <div className="flex items-center gap-2">
                {/* Status dot: blue=active, green=mado, gray=cli history */}
                <span
                  className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                    item.isActive
                      ? "bg-blue-400"
                      : item.kind === "mado"
                        ? "bg-green-500 opacity-60"
                        : "bg-gray-500 opacity-40"
                  }`}
                />
                {isRenaming ? (
                  <input
                    ref={renameInputRef}
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={handleRenameKeyDown}
                    onBlur={commitRename}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    className="min-w-0 flex-1 rounded border border-blue-500 bg-theme-primary px-1 py-0.5 text-sm text-theme-secondary outline-none"
                  />
                ) : (
                  <span
                    className="min-w-0 flex-1 cursor-text truncate text-sm hover:underline"
                    onClick={(e) => handleNameClick(e, item.id, displayName)}
                  >
                    {displayName}
                  </span>
                )}
                {/* Delete button — only for Mado sessions */}
                {!isRenaming && item.kind === "mado" && (
                  <Tooltip content="Delete session">
                    <button
                      onClick={(e) =>
                        handleDeleteClick(e, item.id, displayName)
                      }
                      className="flex-shrink-0 rounded p-0.5 text-theme-muted opacity-0 transition-opacity hover:bg-red-900/30 hover:text-red-400 group-hover:opacity-100"
                      aria-label="Delete session"
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
                        <line x1="3" y1="3" x2="11" y2="11" />
                        <line x1="11" y1="3" x2="3" y2="11" />
                      </svg>
                    </button>
                  </Tooltip>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-theme-muted">
                {item.timestampStr && (
                  <span>{formatTimestamp(item.timestampStr)}</span>
                )}
                {item.messageCount > 0 && (
                  <span>
                    {item.kind === "cli" ? "~" : ""}
                    {item.messageCount} msg
                    {item.messageCount !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Session"
        description={
          deleteTarget
            ? `Are you sure you want to delete "${deleteTarget.name}"? This action cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
    </div>
  );
}
