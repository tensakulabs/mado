import { useEffect, useRef, useCallback } from "react";
import { usePaneStore } from "../stores/panes";
import { useSessionStore } from "../stores/sessions";
import { useUiStore } from "../stores/ui";

interface UseKeyboardOptions {
  onOpenCommandPalette?: () => void;
}

/**
 * Keyboard shortcut handler with tmux-like prefix key (Ctrl+B).
 *
 * After pressing Ctrl+B, the next keypress is interpreted as a command:
 * - " (quote) -> split horizontal
 * - % -> split vertical
 * - Arrow keys -> navigate between panes
 * - x -> close current pane
 * - z -> undo close
 * - c -> new conversation
 *
 * Global shortcuts (no prefix):
 * - Cmd+K / Ctrl+K -> open command palette
 */
export function useKeyboard(options: UseKeyboardOptions = {}) {
  const prefixActive = useRef(false);
  const prefixTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const splitPane = usePaneStore((s) => s.splitPane);
  const closePane = usePaneStore((s) => s.closePane);
  const undoClose = usePaneStore((s) => s.undoClose);
  const navigateFocus = usePaneStore((s) => s.navigateFocus);
  const activePaneId = usePaneStore((s) => s.activePaneId);
  const getLeaves = usePaneStore((s) => s.getLeaves);
  const createSession = useSessionStore((s) => s.createSession);
  const defaultModel = useSessionStore((s) => s.defaultModel);
  const currentView = useUiStore((s) => s.currentView);
  const openGitView = useUiStore((s) => s.openGitView);
  const closeGitView = useUiStore((s) => s.closeGitView);

  const handleSplit = useCallback(
    async (direction: "horizontal" | "vertical") => {
      try {
        const session = await createSession(
          `conversation-${Date.now()}`,
          defaultModel,
          24,
          80,
        );
        splitPane(direction, session.id);
      } catch (err) {
        console.error("Failed to split:", err);
      }
    },
    [createSession, splitPane, defaultModel],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd+K / Ctrl+K -> open command palette (UX-01).
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        options.onOpenCommandPalette?.();
        return;
      }

      // Cmd+G / Ctrl+G -> toggle GitView for current session.
      if ((e.metaKey || e.ctrlKey) && e.key === "g") {
        e.preventDefault();
        if (currentView === "git") {
          closeGitView();
        } else if (activePaneId) {
          // Find the session for the active pane.
          const leaves = getLeaves();
          const activeLeaf = leaves.find((l) => l.id === activePaneId);
          if (activeLeaf?.sessionId) {
            openGitView(activeLeaf.sessionId);
          }
        }
        return;
      }

      // Ctrl+Plus / Ctrl+Equal -> zoom in.
      if (e.ctrlKey && (e.key === "+" || e.key === "=")) {
        e.preventDefault();
        const root = document.documentElement;
        const currentZoom = parseFloat(root.style.fontSize || "16") || 16;
        root.style.fontSize = `${Math.min(currentZoom + 2, 24)}px`;
        return;
      }

      // Ctrl+Minus -> zoom out.
      if (e.ctrlKey && e.key === "-") {
        e.preventDefault();
        const root = document.documentElement;
        const currentZoom = parseFloat(root.style.fontSize || "16") || 16;
        root.style.fontSize = `${Math.max(currentZoom - 2, 10)}px`;
        return;
      }

      // Ctrl+0 -> reset zoom.
      if (e.ctrlKey && e.key === "0") {
        e.preventDefault();
        document.documentElement.style.fontSize = "16px";
        return;
      }

      // Ctrl+B activates prefix mode.
      if (e.ctrlKey && e.key === "b") {
        e.preventDefault();
        prefixActive.current = true;

        // Auto-deactivate after 2 seconds.
        if (prefixTimeout.current) clearTimeout(prefixTimeout.current);
        prefixTimeout.current = setTimeout(() => {
          prefixActive.current = false;
        }, 2000);
        return;
      }

      // If prefix is active, handle the command key.
      if (prefixActive.current) {
        prefixActive.current = false;
        if (prefixTimeout.current) {
          clearTimeout(prefixTimeout.current);
          prefixTimeout.current = null;
        }

        switch (e.key) {
          case '"': // Split horizontal (Shift+')
            e.preventDefault();
            handleSplit("vertical"); // " = vertical split (like tmux)
            break;
          case "%": // Split vertical (Shift+5)
            e.preventDefault();
            handleSplit("horizontal"); // % = horizontal split (like tmux)
            break;
          case "ArrowLeft":
            e.preventDefault();
            navigateFocus("left");
            break;
          case "ArrowRight":
            e.preventDefault();
            navigateFocus("right");
            break;
          case "ArrowUp":
            e.preventDefault();
            navigateFocus("up");
            break;
          case "ArrowDown":
            e.preventDefault();
            navigateFocus("down");
            break;
          case "x": // Close current pane
            e.preventDefault();
            if (activePaneId) closePane(activePaneId);
            break;
          case "z": // Undo close
            e.preventDefault();
            undoClose();
            break;
          case "c": // New conversation
            e.preventDefault();
            handleSplit("horizontal");
            break;
        }
      }
    };

    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      if (prefixTimeout.current) clearTimeout(prefixTimeout.current);
    };
  }, [
    handleSplit,
    navigateFocus,
    closePane,
    undoClose,
    activePaneId,
    options,
    currentView,
    openGitView,
    closeGitView,
    getLeaves,
  ]);
}
