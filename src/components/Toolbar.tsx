import { useCallback, useMemo } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { usePaneStore } from "../stores/panes";
import { useSessionStore } from "../stores/sessions";
import { Tooltip } from "./Tooltip";

interface ToolbarProps {
  onOpenCommandPalette: () => void;
  onOpenLayoutModal: () => void;
}

export function Toolbar({ onOpenCommandPalette, onOpenLayoutModal }: ToolbarProps) {
  const splitPane = usePaneStore((s) => s.splitPane);
  const closedPanes = usePaneStore((s) => s.closedPanes);
  const undoClose = usePaneStore((s) => s.undoClose);
  const getLeaves = usePaneStore((s) => s.getLeaves);
  const columns = usePaneStore((s) => s.columns);
  const activePaneId = usePaneStore((s) => s.activePaneId);
  const initSinglePane = usePaneStore((s) => s.initSinglePane);
  const createSession = useSessionStore((s) => s.createSession);
  const defaultModel = useSessionStore((s) => s.defaultModel);

  const paneCount = useMemo(
    () => columns.reduce((sum, col) => sum + col.cells.length, 0),
    [columns],
  );

  const hasConversation = useMemo(
    () => columns.some((col) => col.cells.some((cell) => !!cell.sessionId)),
    [columns],
  );

  const handleNewConversation = useCallback(async () => {
    try {
      const session = await createSession(
        `conversation-${Date.now()}`,
        defaultModel,
        24,
        80,
      );
      const panes = getLeaves();
      if (panes.length > 0) {
        splitPane("horizontal", session.id);
      }
    } catch (err) {
      console.error("Failed to create conversation:", err);
    }
  }, [createSession, splitPane, getLeaves, defaultModel]);

  const handleSplitH = useCallback(async () => {
    try {
      const session = await createSession(
        `conversation-${Date.now()}`,
        defaultModel,
        24,
        80,
      );
      splitPane("horizontal", session.id);
    } catch (err) {
      console.error("[SplitH] Failed:", err);
    }
  }, [createSession, splitPane, defaultModel]);

  const handleSplitV = useCallback(async () => {
    try {
      const session = await createSession(
        `conversation-${Date.now()}`,
        defaultModel,
        24,
        80,
      );
      splitPane("vertical", session.id);
    } catch (err) {
      console.error("Failed to split:", err);
    }
  }, [createSession, splitPane, defaultModel]);

  const handleOpenFolder = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Open Folder",
      });
      if (selected && typeof selected === "string") {
        const folderName = selected.split("/").pop() || "workspace";
        const session = await createSession(
          folderName,
          defaultModel,
          24,
          80,
          selected,
        );
        const panes = getLeaves();
        if (panes.length > 0) {
          splitPane("horizontal", session.id);
        }
      }
    } catch (err) {
      console.error("Failed to open folder:", err);
    }
  }, [createSession, splitPane, getLeaves, defaultModel]);

  const handleUndo = useCallback(() => {
    undoClose();
  }, [undoClose]);

  const handleGoHome = useCallback(() => {
    const leaves = getLeaves();
    if (leaves.length <= 1) return;
    const active = leaves.find((l) => l.id === activePaneId);
    if (active) {
      initSinglePane(active.sessionId);
    } else if (leaves.length > 0) {
      initSinglePane(leaves[0].sessionId);
    }
  }, [getLeaves, activePaneId, initSinglePane]);

  return (
    <div className="flex items-center justify-between border-b border-theme-primary bg-theme-primary px-3 py-1">
      {/* Left: home button */}
      <div className="flex items-center gap-3">
        {paneCount > 1 && (
          <Tooltip content="Return to single conversation view" position="bottom">
            <button
              onClick={handleGoHome}
              className="rounded px-1.5 py-0.5 text-xs text-theme-muted hover:bg-theme-tertiary hover:text-theme-primary"
            >
              Home
            </button>
          </Tooltip>
        )}
      </div>

      {/* Center: actions (only show when there's an active conversation) */}
      {hasConversation ? (
        <div className="flex items-center gap-1">
          <Tooltip content="New Conversation (Ctrl+B c)" position="bottom">
            <button
              onClick={handleNewConversation}
              className="rounded px-2 py-0.5 text-xs text-theme-muted hover:bg-theme-tertiary hover:text-theme-primary"
            >
              + New
            </button>
          </Tooltip>
          <Tooltip content="Open Folder (loads previous Claude sessions)" position="bottom">
            <button
              onClick={handleOpenFolder}
              className="rounded px-2 py-0.5 text-xs text-theme-accent hover:bg-blue-900/30 hover:text-blue-200"
            >
              Open Folder
            </button>
          </Tooltip>
          <div className="mx-1 h-3 w-px bg-theme-tertiary" />
          <Tooltip content='Split Space Horizontal (Ctrl+B ")' position="bottom">
            <button
              onClick={handleSplitH}
              className="rounded px-2 py-0.5 text-xs text-theme-muted hover:bg-theme-tertiary hover:text-theme-primary"
            >
              Split H
            </button>
          </Tooltip>
          <Tooltip content="Split Space Vertical (Ctrl+B %)" position="bottom">
            <button
              onClick={handleSplitV}
              className="rounded px-2 py-0.5 text-xs text-theme-muted hover:bg-theme-tertiary hover:text-theme-primary"
            >
              Split V
            </button>
          </Tooltip>
          {closedPanes.length > 0 && (
            <>
              <div className="mx-1 h-3 w-px bg-theme-tertiary" />
              <Tooltip content="Undo Close (Ctrl+B z)" position="bottom">
                <button
                  onClick={handleUndo}
                  className="rounded px-2 py-0.5 text-xs text-yellow-400 hover:bg-yellow-900/30 hover:text-yellow-300"
                >
                  Undo ({closedPanes.length})
                </button>
              </Tooltip>
            </>
          )}
          <div className="mx-1 h-3 w-px bg-theme-tertiary" />
          <Tooltip content="Command Palette (Cmd+K)" position="bottom">
            <button
              onClick={onOpenCommandPalette}
              className="rounded px-2 py-0.5 text-xs text-theme-muted hover:bg-theme-tertiary hover:text-theme-primary"
            >
              Cmd+K
            </button>
          </Tooltip>
        </div>
      ) : (
        <div />
      )}

      {/* Right: layout */}
      <div className="flex items-center gap-2">
        <Tooltip content="Layout (Ctrl+B L)" position="bottom" align="end">
          <button
            onClick={onOpenLayoutModal}
            className="rounded p-1 text-theme-muted hover:bg-theme-tertiary hover:text-theme-primary"
            aria-label="Layout (Ctrl+B L)"
          >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="h-3.5 w-3.5"
          >
            <path
              fillRule="evenodd"
              d="M1 2.75A.75.75 0 0 1 1.75 2h3.5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-.75.75h-3.5A.75.75 0 0 1 1 6.25v-3.5Zm1.5.75v2h2v-2h-2ZM1 9.75A.75.75 0 0 1 1.75 9h3.5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-.75.75h-3.5a.75.75 0 0 1-.75-.75v-3.5Zm1.5.75v2h2v-2h-2ZM8 2.75A.75.75 0 0 1 8.75 2h3.5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-.75.75h-3.5A.75.75 0 0 1 8 6.25v-3.5Zm1.5.75v2h2v-2h-2ZM8 9.75A.75.75 0 0 1 8.75 9h3.5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-.75.75h-3.5a.75.75 0 0 1-.75-.75v-3.5Zm1.5.75v2h2v-2h-2Z"
              clipRule="evenodd"
            />
          </svg>
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
