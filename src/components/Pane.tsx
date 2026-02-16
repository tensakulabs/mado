import { useCallback, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { ChatView } from "./ChatView";
import { GitView } from "./GitView";
import { Timeline } from "./Timeline";
// ChangeDetails no longer used - [+N -M] opens GitView directly.
import { PaneWelcome } from "./PaneWelcome";
import { usePaneStore } from "../stores/panes";
import { useSessionStore } from "../stores/sessions";
import { useUiStore } from "../stores/ui";
import { useVersioning } from "../hooks/useVersioning";
import { useChangeIndicator } from "../hooks/useChangeIndicator";

interface PaneProps {
  paneId: string;
  sessionId?: string; // Optional - undefined when pane is in welcome state
}

/**
 * Wraps a ChatView component with pane chrome (border, header, focus state).
 * Includes save button, timeline toggle, and real-time change indicator.
 */
export function Pane({ paneId, sessionId }: PaneProps) {
  // ═══════════════════════════════════════════════════════════════════════════
  // ALL HOOKS MUST BE CALLED UNCONDITIONALLY BEFORE ANY EARLY RETURNS
  // React requires hooks to be called in the same order on every render.
  // ═══════════════════════════════════════════════════════════════════════════

  // Store selectors
  const activePaneId = usePaneStore((s) => s.activePaneId);
  const focusPane = usePaneStore((s) => s.focusPane);
  const closePane = usePaneStore((s) => s.closePane);
  const splitPane = usePaneStore((s) => s.splitPane);
  const replaceSession = usePaneStore((s) => s.replaceSession);
  const getSession = useSessionStore((s) => s.getSession);
  const destroySession = useSessionStore((s) => s.destroySession);
  const createSession = useSessionStore((s) => s.createSession);
  const defaultModel = useSessionStore((s) => s.defaultModel);
  const currentView = useUiStore((s) => s.currentView);
  const gitViewSessionId = useUiStore((s) => s.gitViewSessionId);
  const openGitView = useUiStore((s) => s.openGitView);
  const closeGitView = useUiStore((s) => s.closeGitView);

  // Local state
  const [showTimeline, setShowTimeline] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Custom hooks
  const { save, isSaving, error: versionError, clearError } = useVersioning();
  const {
    insertions,
    deletions,
    files,
    refresh: refreshChanges,
  } = useChangeIndicator(sessionId ?? "");

  // Derived state (safe to compute after hooks, before callbacks)
  const session = sessionId ? getSession(sessionId) : undefined;
  const isActive = activePaneId === paneId;
  const hasChanges = insertions > 0 || deletions > 0;

  // Callbacks (all useCallback hooks MUST be before early return)
  const handleFocus = useCallback(() => {
    focusPane(paneId);
  }, [paneId, focusPane]);

  const handleClose = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!sessionId) {
        closePane(paneId);
        return;
      }
      // If conversation is empty, delete the session entirely.
      if (session && session.message_count === 0) {
        try {
          await destroySession(sessionId);
        } catch (err) {
          console.error("Failed to destroy empty session:", err);
        }
      }
      closePane(paneId);
    },
    [paneId, closePane, session, sessionId, destroySession],
  );

  const handleSave = useCallback(async () => {
    if (!sessionId) return;
    const message = `Milestone ${new Date().toLocaleTimeString()}`;
    const milestone = await save(sessionId, message);
    if (milestone) {
      setSaveMessage("Saved!");
      refreshChanges();
      setTimeout(() => setSaveMessage(null), 2000);
    }
  }, [sessionId, save, refreshChanges]);

  const toggleTimeline = useCallback(() => {
    setShowTimeline((prev) => !prev);
  }, []);

  const toggleChangeDetails = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      // If GitView is already open for this session, close it; otherwise open it.
      if (currentView === "git" && gitViewSessionId === sessionId) {
        closeGitView();
      } else if (sessionId) {
        openGitView(sessionId);
      }
    },
    [currentView, gitViewSessionId, sessionId, openGitView, closeGitView],
  );

  const getWorkspaceDisplay = useCallback(() => {
    const workingDir = session?.working_dir;
    if (!workingDir) return "default";
    if (workingDir.endsWith("/mado") || workingDir === "mado") {
      return "default";
    }
    return workingDir.split("/").pop() || "default";
  }, [session?.working_dir]);

  const handleWorkspaceClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        const selected = await open({
          directory: true,
          multiple: false,
          title: "Select Workspace Folder",
          defaultPath: session?.working_dir,
        });
        if (selected && typeof selected === "string") {
          if (selected === session?.working_dir) return;

          const folderName = selected.split("/").pop() || "workspace";
          const newSession = await createSession(
            folderName,
            defaultModel,
            24,
            80,
            selected,
          );

          if (session && session.message_count === 0) {
            replaceSession(paneId, newSession.id);
            if (sessionId) {
              try {
                await destroySession(sessionId);
              } catch (err) {
                console.error("Failed to destroy old session:", err);
              }
            }
          } else {
            splitPane("horizontal", newSession.id);
          }
        }
      } catch (err) {
        console.error("Failed to change workspace:", err);
      }
    },
    [
      session,
      sessionId,
      createSession,
      defaultModel,
      paneId,
      replaceSession,
      splitPane,
      destroySession,
    ],
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // EARLY RETURN - Only allowed AFTER all hooks have been called
  // ═══════════════════════════════════════════════════════════════════════════
  if (!sessionId) {
    return <PaneWelcome paneId={paneId} />;
  }

  return (
    <div
      className={`flex h-full w-full flex-col overflow-hidden ${
        isActive
          ? "ring-1 ring-blue-500/60"
          : "ring-1 ring-theme-primary"
      }`}
      onMouseDown={handleFocus}
    >
      {/* Pane header */}
      <div
        className={`flex items-center justify-between px-3 py-1 text-sm ${
          isActive
            ? "bg-blue-900/30 text-theme-secondary"
            : "bg-theme-tertiary text-theme-muted"
        }`}
      >
        <div className="flex items-center gap-3 truncate">
          {/* Workspace - clickable to change folder */}
          <button
            onClick={handleWorkspaceClick}
            className="flex items-center gap-1.5 truncate rounded px-2 py-1 text-sm font-medium hover:bg-theme-tertiary"
            title={session?.working_dir ? `Workspace: ${session.working_dir}\nClick to change` : "Click to select workspace"}
          >
            <span className="text-blue-400">📁</span>
            <span className="truncate">{getWorkspaceDisplay()}</span>
          </button>
          {/* Change indicator - always show when session exists */}
          {session && (
            <div className="relative">
              <button
                onClick={toggleChangeDetails}
                className={`font-mono text-xs rounded px-1 py-0.5 transition-colors ${
                  hasChanges
                    ? "hover:bg-theme-tertiary"
                    : "text-theme-muted hover:bg-theme-tertiary"
                }`}
                title={
                  hasChanges
                    ? `${files.length} file${files.length !== 1 ? "s" : ""} changed - click for details`
                    : "No uncommitted changes"
                }
              >
                [<span className={insertions > 0 ? "text-green-400" : "text-theme-muted"}>+{insertions}</span>{" "}
                <span className={deletions > 0 ? "text-red-400" : "text-theme-muted"}>-{deletions}</span>]
              </button>
              {/* ChangeDetails popup removed - [+N -M] now opens GitView */}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Save and history buttons - show for all sessions */}
          {session && (
            <>
              {saveMessage && (
                <span className="text-xs text-green-400">{saveMessage}</span>
              )}
              {versionError && (
                <span
                  className="text-xs text-yellow-400 cursor-pointer"
                  onClick={clearError}
                  title={versionError}
                >
                  {versionError.includes("No changes") ? "No changes" : "Error"}
                </span>
              )}
              {/* Save button */}
              <button
                onClick={handleSave}
                disabled={isSaving}
                className={`rounded px-2 py-1 text-xs ${
                  isSaving
                    ? "text-theme-muted"
                    : "text-theme-muted hover:bg-green-900/30 hover:text-green-400"
                }`}
                title="Save milestone"
              >
                {isSaving ? "..." : "save"}
              </button>
              {/* Timeline toggle */}
              <button
                onClick={toggleTimeline}
                className={`rounded px-2 py-1 text-xs ${
                  showTimeline
                    ? "bg-blue-900/30 text-blue-400"
                    : "text-theme-muted hover:bg-theme-tertiary hover:text-theme-secondary"
                }`}
                title="Toggle timeline"
              >
                history
              </button>
            </>
          )}
          {/* Close button */}
          <button
            onClick={handleClose}
            className="rounded px-2 py-1 text-theme-muted hover:bg-red-900/30 hover:text-red-400"
            title="Close pane (Ctrl+B x)"
          >
            ×
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* Chat area or Git view */}
        <div className="flex-1 min-h-0">
          {currentView === "git" && gitViewSessionId === sessionId ? (
            <GitView sessionId={sessionId} onClose={closeGitView} />
          ) : (
            <ChatView sessionId={sessionId} />
          )}
        </div>

        {/* Timeline sidebar (only show in chat view) */}
        {showTimeline && currentView === "chat" && (
          <div className="w-64 min-w-[200px]">
            <Timeline
              sessionId={sessionId}
              onClose={() => setShowTimeline(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
