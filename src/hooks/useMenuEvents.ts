import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { usePaneStore } from "../stores/panes";
import { useSessionStore } from "../stores/sessions";
import { useUiStore } from "../stores/ui";

interface UseMenuEventsOptions {
  onOpenCommandPalette: () => void;
  onOpenLayoutModal: () => void;
  onOpenSettings: () => void;
}

/**
 * Listens for native menu events emitted from the Tauri Rust backend
 * and dispatches the corresponding frontend actions.
 *
 * Uses getState() to avoid stale closures in the event listener.
 */
export function useMenuEvents(options: UseMenuEventsOptions) {
  useEffect(() => {
    const unlisten = listen<string>("menu-action", async (event) => {
      const action = event.payload;
      const { splitPane, closePane, undoClose, activePaneId, getLeaves } =
        usePaneStore.getState();
      const { createSession, defaultModel } = useSessionStore.getState();
      const { currentView, openGitView, closeGitView } = useUiStore.getState();

      switch (action) {
        case "new-conversation": {
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
            console.error("Menu: Failed to create conversation:", err);
          }
          break;
        }

        case "open-folder": {
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
            console.error("Menu: Failed to open folder:", err);
          }
          break;
        }

        case "close-pane":
          if (activePaneId) closePane(activePaneId);
          break;

        case "undo-close":
          undoClose();
          break;

        case "toggle-git":
          if (currentView === "git") {
            closeGitView();
          } else if (activePaneId) {
            const leaves = getLeaves();
            const activeLeaf = leaves.find((l) => l.id === activePaneId);
            if (activeLeaf?.sessionId) {
              openGitView(activeLeaf.sessionId);
            }
          }
          break;

        case "settings":
          options.onOpenSettings();
          break;

        case "command-palette":
          options.onOpenCommandPalette();
          break;

        case "layout":
          options.onOpenLayoutModal();
          break;

        case "split-horizontal": {
          try {
            const session = await createSession(
              `conversation-${Date.now()}`,
              defaultModel,
              24,
              80,
            );
            splitPane("horizontal", session.id);
          } catch (err) {
            console.error("Menu: Failed to split horizontal:", err);
          }
          break;
        }

        case "split-vertical": {
          try {
            const session = await createSession(
              `conversation-${Date.now()}`,
              defaultModel,
              24,
              80,
            );
            splitPane("vertical", session.id);
          } catch (err) {
            console.error("Menu: Failed to split vertical:", err);
          }
          break;
        }

        case "zoom-in": {
          const root = document.documentElement;
          const current = parseFloat(root.style.fontSize || "16") || 16;
          root.style.fontSize = `${Math.min(current + 2, 24)}px`;
          break;
        }

        case "zoom-out": {
          const root = document.documentElement;
          const current = parseFloat(root.style.fontSize || "16") || 16;
          root.style.fontSize = `${Math.max(current - 2, 10)}px`;
          break;
        }

        case "zoom-reset":
          document.documentElement.style.fontSize = "16px";
          break;
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [options.onOpenCommandPalette, options.onOpenLayoutModal, options.onOpenSettings]);
}
