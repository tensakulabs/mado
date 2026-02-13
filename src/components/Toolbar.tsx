import { useCallback } from "react";
import { usePaneStore } from "../stores/panes";
import { useSessionStore } from "../stores/sessions";
import { ModelPicker } from "./ModelPicker";
import type { DaemonStatus } from "../lib/ipc";

interface ToolbarProps {
  daemonInfo: DaemonStatus | null;
  connectionState: "connecting" | "connected" | "disconnected";
  onOpenCommandPalette: () => void;
}

export function Toolbar({
  daemonInfo,
  connectionState,
  onOpenCommandPalette,
}: ToolbarProps) {
  const splitPane = usePaneStore((s) => s.splitPane);
  const closedPanes = usePaneStore((s) => s.closedPanes);
  const undoClose = usePaneStore((s) => s.undoClose);
  const getLeaves = usePaneStore((s) => s.getLeaves);
  const activePaneId = usePaneStore((s) => s.activePaneId);
  const initSinglePane = usePaneStore((s) => s.initSinglePane);
  const createSession = useSessionStore((s) => s.createSession);
  const defaultModel = useSessionStore((s) => s.defaultModel);

  const statusDot = {
    connecting: "bg-yellow-400 animate-pulse",
    connected: "bg-green-400",
    disconnected: "bg-red-400",
  }[connectionState];

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
      console.error("Failed to split:", err);
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

  const handleUndo = useCallback(() => {
    undoClose();
  }, [undoClose]);

  // UX-13: Home button returns to single-conversation view.
  const handleGoHome = useCallback(() => {
    const leaves = getLeaves();
    if (leaves.length <= 1) return; // Already single-pane.
    const active = leaves.find((l) => l.id === activePaneId);
    if (active) {
      initSinglePane(active.sessionId);
    } else if (leaves.length > 0) {
      initSinglePane(leaves[0].sessionId);
    }
  }, [getLeaves, activePaneId, initSinglePane]);

  const paneCount = getLeaves().length;

  return (
    <div className="flex items-center justify-between border-b border-gray-700/50 bg-[#0a0a1a] px-3 py-1">
      {/* Left: status + title + home */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${statusDot}`} />
          <span className="text-xs font-medium text-gray-400">Kobo</span>
        </div>
        {daemonInfo && (
          <span className="text-xs text-gray-600">
            v{daemonInfo.version}
          </span>
        )}
        {/* Home button (UX-13) */}
        {paneCount > 1 && (
          <button
            onClick={handleGoHome}
            className="rounded px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-700/50 hover:text-gray-200"
            title="Return to single conversation view"
          >
            Home
          </button>
        )}
      </div>

      {/* Center: actions */}
      <div className="flex items-center gap-1">
        <ModelPicker />
        <div className="mx-1 h-3 w-px bg-gray-700/50" />
        <button
          onClick={handleNewConversation}
          className="rounded px-2 py-0.5 text-xs text-gray-400 hover:bg-gray-700/50 hover:text-gray-200"
          title="New Conversation (Ctrl+B c)"
        >
          + New
        </button>
        <div className="mx-1 h-3 w-px bg-gray-700/50" />
        <button
          onClick={handleSplitH}
          className="rounded px-2 py-0.5 text-xs text-gray-400 hover:bg-gray-700/50 hover:text-gray-200"
          title='Split Space Horizontal (Ctrl+B ")'
        >
          Split H
        </button>
        <button
          onClick={handleSplitV}
          className="rounded px-2 py-0.5 text-xs text-gray-400 hover:bg-gray-700/50 hover:text-gray-200"
          title="Split Space Vertical (Ctrl+B %)"
        >
          Split V
        </button>
        {closedPanes.length > 0 && (
          <>
            <div className="mx-1 h-3 w-px bg-gray-700/50" />
            <button
              onClick={handleUndo}
              className="rounded px-2 py-0.5 text-xs text-yellow-400 hover:bg-yellow-900/30 hover:text-yellow-300"
              title="Undo Close (Ctrl+B z)"
            >
              Undo ({closedPanes.length})
            </button>
          </>
        )}
        <div className="mx-1 h-3 w-px bg-gray-700/50" />
        <button
          onClick={onOpenCommandPalette}
          className="rounded px-2 py-0.5 text-xs text-gray-400 hover:bg-gray-700/50 hover:text-gray-200"
          title="Command Palette (Cmd+K)"
        >
          Cmd+K
        </button>
      </div>

      {/* Right: info */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-600">
          {paneCount} conversation{paneCount !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}
