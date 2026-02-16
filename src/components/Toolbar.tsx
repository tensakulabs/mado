import { useCallback, useMemo } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { usePaneStore, type PaneNode } from "../stores/panes";
import { useSessionStore } from "../stores/sessions";
import { GridResizePopup } from "./GridResizePopup";

interface ToolbarProps {
  onOpenCommandPalette: () => void;
}

// Helper to count leaves without creating new array.
function countLeaves(node: PaneNode | null): number {
  if (!node) return 0;
  if (node.type === "leaf") return 1;
  return countLeaves(node.children[0]) + countLeaves(node.children[1]);
}

// Check if any pane has an active session.
function hasActiveSession(node: PaneNode | null): boolean {
  if (!node) return false;
  if (node.type === "leaf") return !!node.sessionId;
  return hasActiveSession(node.children[0]) || hasActiveSession(node.children[1]);
}

export function Toolbar({ onOpenCommandPalette }: ToolbarProps) {
  const splitPane = usePaneStore((s) => s.splitPane);
  const closedPanes = usePaneStore((s) => s.closedPanes);
  const undoClose = usePaneStore((s) => s.undoClose);
  const getLeaves = usePaneStore((s) => s.getLeaves);
  const root = usePaneStore((s) => s.root);
  const activePaneId = usePaneStore((s) => s.activePaneId);
  const initSinglePane = usePaneStore((s) => s.initSinglePane);
  const createSession = useSessionStore((s) => s.createSession);
  const defaultModel = useSessionStore((s) => s.defaultModel);

  // Memoize pane count to avoid infinite loop.
  const paneCount = useMemo(() => countLeaves(root), [root]);

  // Check if there's at least one active conversation.
  const hasConversation = useMemo(() => hasActiveSession(root), [root]);

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
    console.log("[SplitH] Starting...");
    try {
      const session = await createSession(
        `conversation-${Date.now()}`,
        defaultModel,
        24,
        80,
      );
      console.log("[SplitH] Session created:", session.id);
      const result = splitPane("horizontal", session.id);
      console.log("[SplitH] splitPane result:", result);
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
        // Extract folder name for session name.
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

  return (
    <div className="flex items-center justify-between border-b border-theme-primary bg-theme-primary px-3 py-1">
      {/* Left: home button */}
      <div className="flex items-center gap-3">
        {/* Home button (UX-13) */}
        {paneCount > 1 && (
          <button
            onClick={handleGoHome}
            className="rounded px-1.5 py-0.5 text-xs text-theme-muted hover:bg-theme-tertiary hover:text-theme-primary"
            title="Return to single conversation view"
          >
            Home
          </button>
        )}
      </div>

      {/* Center: actions (only show when there's an active conversation) */}
      {hasConversation ? (
        <div className="flex items-center gap-1">
          <button
            onClick={handleNewConversation}
            className="rounded px-2 py-0.5 text-xs text-theme-muted hover:bg-theme-tertiary hover:text-theme-primary"
            title="New Conversation (Ctrl+B c)"
          >
            + New
          </button>
          <button
            onClick={handleOpenFolder}
            className="rounded px-2 py-0.5 text-xs text-theme-accent hover:bg-blue-900/30 hover:text-blue-200"
            title="Open Folder (loads previous Claude sessions)"
          >
            Open Folder
          </button>
          <div className="mx-1 h-3 w-px bg-theme-tertiary" />
          <button
            onClick={handleSplitH}
            className="rounded px-2 py-0.5 text-xs text-theme-muted hover:bg-theme-tertiary hover:text-theme-primary"
            title='Split Space Horizontal (Ctrl+B ")'
          >
            Split H
          </button>
          <button
            onClick={handleSplitV}
            className="rounded px-2 py-0.5 text-xs text-theme-muted hover:bg-theme-tertiary hover:text-theme-primary"
            title="Split Space Vertical (Ctrl+B %)"
          >
            Split V
          </button>
          <GridResizePopup />
          {closedPanes.length > 0 && (
            <>
              <div className="mx-1 h-3 w-px bg-theme-tertiary" />
              <button
                onClick={handleUndo}
                className="rounded px-2 py-0.5 text-xs text-yellow-400 hover:bg-yellow-900/30 hover:text-yellow-300"
                title="Undo Close (Ctrl+B z)"
              >
                Undo ({closedPanes.length})
              </button>
            </>
          )}
          <div className="mx-1 h-3 w-px bg-theme-tertiary" />
          <button
            onClick={onOpenCommandPalette}
            className="rounded px-2 py-0.5 text-xs text-theme-muted hover:bg-theme-tertiary hover:text-theme-primary"
            title="Command Palette (Cmd+K)"
          >
            Cmd+K
          </button>
        </div>
      ) : (
        <div />
      )}

      {/* Right: info */}
      <div className="flex items-center gap-2">
        {hasConversation && (
          <span className="text-xs text-theme-muted">
            {paneCount} conversation{paneCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );
}
