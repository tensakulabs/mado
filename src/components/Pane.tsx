import { useCallback, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { ChatView } from "./ChatView";
import { GitView } from "./GitView";
import { Timeline } from "./Timeline";
import { CommitModal } from "./git/CommitModal";
import { PaneWelcome } from "./PaneWelcome";
import { SessionSidebar } from "./SessionSidebar";
import { Tooltip } from "./Tooltip";
import { usePaneStore } from "../stores/panes";
import { useSessionStore } from "../stores/sessions";
import { useUiStore } from "../stores/ui";
import { useChangeIndicator } from "../hooks/useChangeIndicator";
import { useResizableSidebar } from "../hooks/useResizableSidebar";
import { gitStatus, gitBranchInfo } from "../lib/ipc";

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
  const [paneSidebarOpen, setPaneSidebarOpen] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [commitModalOpen, setCommitModalOpen] = useState(false);
  const [branch, setBranch] = useState("main");
  const [hasRemote, setHasRemote] = useState(false);
  const [commitFilePaths, setCommitFilePaths] = useState<string[]>([]);

  // Resizable sidebar hooks
  const { width: sidebarWidth, handleMouseDown: onSidebarResizeMouseDown, isResizing: isSidebarResizing } = useResizableSidebar();
  const { width: timelineWidth, handleMouseDown: onTimelineResizeMouseDown, isResizing: isTimelineResizing } = useResizableSidebar({ storageKey: "mado-timeline-width", side: "right" });

  // Custom hooks (useVersioning removed — CommitModal handles commits now)
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
    try {
      const [status, branchInfo] = await Promise.all([
        gitStatus(sessionId),
        gitBranchInfo(sessionId),
      ]);
      const allFiles = [...status.staged, ...status.unstaged];
      setBranch(branchInfo.branch);
      setHasRemote(branchInfo.has_remote);
      setCommitFilePaths(allFiles.map((f) => f.path));
      setCommitModalOpen(true);
    } catch (err) {
      console.error("Failed to fetch git status:", err);
    }
  }, [sessionId]);

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
      className={`flex h-full w-full min-w-0 flex-col overflow-hidden ${
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
        <div className="flex items-center gap-1.5 truncate">
          {/* Workspace - clickable to change folder */}
          <Tooltip content={session?.working_dir ? `Workspace: ${session.working_dir} - Click to change` : "Click to select workspace"} position="bottom">
            <button
              onClick={handleWorkspaceClick}
              className="flex items-center gap-1.5 truncate rounded px-2 py-1 text-sm font-medium hover:bg-theme-tertiary"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 16 16"
                fill="currentColor"
                className="h-4.5 w-4.5 flex-shrink-0 text-theme-muted"
              >
                <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.879a1.5 1.5 0 0 1 1.06.44l1.122 1.12A1.5 1.5 0 0 0 9.62 5H12.5A1.5 1.5 0 0 1 14 6.5v1.384l-2.162 3.243A1.75 1.75 0 0 1 10.382 12H2.476a.476.476 0 0 1-.396-.737L4.677 7H2V4.5Z" />
                <path d="M5.25 7 2.5 11.25h7.882a.25.25 0 0 0 .208-.112L13.34 7H5.25Z" />
              </svg>
              <span className="truncate">{getWorkspaceDisplay()}</span>
            </button>
          </Tooltip>
          {/* Sidebar panel toggle — right of workspace name */}
          <Tooltip content={paneSidebarOpen ? "Hide sidebar" : "Show sidebar"} position="bottom">
            <button
              onClick={(e) => { e.stopPropagation(); setPaneSidebarOpen((v) => !v); }}
              className={`rounded p-1 transition-colors ${
                paneSidebarOpen
                  ? "text-theme-accent hover:bg-theme-tertiary"
                  : "text-theme-muted hover:bg-theme-tertiary hover:text-theme-secondary"
              }`}
              aria-label={paneSidebarOpen ? "Hide sidebar" : "Show sidebar"}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 16 16"
                fill="currentColor"
                className="h-3.5 w-3.5"
              >
                <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9ZM3.5 3a.5.5 0 0 0-.5.5v9a.5.5 0 0 0 .5.5H6V3H3.5ZM7 3v10h5.5a.5.5 0 0 0 .5-.5v-9a.5.5 0 0 0-.5-.5H7Z" />
              </svg>
            </button>
          </Tooltip>
          {/* Change indicator - always show when session exists */}
          {session && (
            <div className="relative">
              <Tooltip content={
                  hasChanges
                    ? `${files.length} file${files.length !== 1 ? "s" : ""} changed - click for details`
                    : "No uncommitted changes"
                } position="bottom">
                <button
                  onClick={toggleChangeDetails}
                  className={`font-mono text-xs rounded px-1 py-0.5 transition-colors ${
                    hasChanges
                      ? "hover:bg-theme-tertiary"
                      : "text-theme-muted hover:bg-theme-tertiary"
                  }`}
                >
                  [<span className={insertions > 0 ? "text-green-400" : "text-theme-muted"}>+{insertions}</span>{" "}
                  <span className={deletions > 0 ? "text-red-400" : "text-theme-muted"}>-{deletions}</span>]
                </button>
              </Tooltip>
              {/* ChangeDetails popup removed - [+N -M] now opens GitView */}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Save and history buttons - show for all sessions */}
          {session && (
            <>
              {/* Save button — opens commit modal */}
              <Tooltip content="Commit changes" position="bottom" align="end">
                <button
                  onClick={handleSave}
                  className="rounded border border-green-700/50 px-2 py-0.5 text-xs font-medium text-green-400 hover:border-green-500 hover:bg-green-900/30"
                >
                  Save
                </button>
              </Tooltip>
              <div className="h-3 w-px bg-theme-tertiary" />
              {/* Timeline toggle — subtle, secondary action */}
              <Tooltip content="Toggle timeline" position="bottom" align="end">
                <button
                  onClick={toggleTimeline}
                  className={`rounded px-2 py-0.5 text-xs ${
                    showTimeline
                      ? "bg-blue-900/30 text-blue-400"
                      : "text-theme-muted hover:bg-theme-tertiary hover:text-theme-secondary"
                  }`}
                >
                  History
                </button>
              </Tooltip>
            </>
          )}
          {/* Close button */}
          <Tooltip content="Close pane (Ctrl+B x)" position="bottom" align="end">
            <button
              onClick={handleClose}
              className="rounded px-2 py-1 text-theme-muted hover:bg-red-900/30 hover:text-red-400"
              aria-label="Close pane"
            >
              ×
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
        {/* Per-pane session sidebar */}
        {paneSidebarOpen && (
          <div
            className="relative flex-shrink-0"
            style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
          >
            <SessionSidebar
              paneId={paneId}
              sessionId={sessionId}
              onClose={() => setPaneSidebarOpen(false)}
            />
            {/* Resize drag handle */}
            <div
              onMouseDown={onSidebarResizeMouseDown}
              className={`absolute right-0 top-0 h-full w-1 cursor-col-resize z-10 transition-colors ${
                isSidebarResizing ? "bg-blue-500/50" : "hover:bg-blue-500/30"
              }`}
            />
          </div>
        )}
        {/* Chat area or Git view */}
        <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
          {currentView === "git" && gitViewSessionId === sessionId ? (
            <GitView sessionId={sessionId} onClose={closeGitView} />
          ) : (
            <ChatView sessionId={sessionId} />
          )}
        </div>

        {/* Timeline sidebar (only show in chat view) */}
        {showTimeline && currentView === "chat" && (
          <div className="relative flex-shrink-0" style={{ width: `${timelineWidth}px` }}>
            {/* Resize drag handle on left edge */}
            <div
              onMouseDown={onTimelineResizeMouseDown}
              className={`absolute left-0 top-0 h-full w-1 cursor-col-resize z-10 transition-colors ${
                isTimelineResizing ? "bg-blue-500/50" : "hover:bg-blue-500/30"
              }`}
            />
            <Timeline
              sessionId={sessionId}
              onClose={() => setShowTimeline(false)}
            />
          </div>
        )}
      </div>

      {/* Commit modal */}
      <CommitModal
        isOpen={commitModalOpen}
        onClose={() => setCommitModalOpen(false)}
        sessionId={sessionId}
        branch={branch}
        hasRemote={hasRemote}
        fileCount={files.length}
        insertions={insertions}
        deletions={deletions}
        filePaths={commitFilePaths}
        onCommitComplete={refreshChanges}
      />
    </div>
  );
}
