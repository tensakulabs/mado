import { useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { usePaneStore } from "../stores/panes";
import { useSessionStore } from "../stores/sessions";

interface PaneWelcomeProps {
  paneId: string;
}

/**
 * Welcome screen for panes without a session.
 * Shows when user first opens app - prompts to choose workspace or start chatting.
 */
export function PaneWelcome({ paneId }: PaneWelcomeProps) {
  const replaceSession = usePaneStore((s) => s.replaceSession);
  const createSession = useSessionStore((s) => s.createSession);
  const defaultModel = useSessionStore((s) => s.defaultModel);

  const handleChooseWorkspace = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Choose Workspace Folder",
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
        replaceSession(paneId, session.id);
      }
    } catch (err) {
      console.error("Failed to select workspace:", err);
    }
  }, [paneId, createSession, defaultModel, replaceSession]);

  const handleStartConversation = useCallback(async () => {
    try {
      const session = await createSession(
        "conversation",
        defaultModel,
        24,
        80,
      );
      replaceSession(paneId, session.id);
    } catch (err) {
      console.error("Failed to create session:", err);
    }
  }, [paneId, createSession, defaultModel, replaceSession]);

  return (
    <div className="flex h-full w-full flex-col bg-theme-secondary select-none">
      <div className="flex flex-1 items-center justify-center">
        <div className="max-w-md text-center">
          <div className="mb-6 text-5xl">📁</div>
          <h2 className="mb-2 text-xl font-medium text-theme-primary">
            Welcome to Kobo
          </h2>
          <p className="mb-8 text-sm text-theme-muted">
            Choose a workspace folder to give your AI context about your project,
            or start chatting right away.
          </p>

          <div className="flex flex-col gap-3">
            <button
              onClick={handleChooseWorkspace}
              className="w-full rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500"
            >
              Choose Workspace
            </button>
            <button
              onClick={handleStartConversation}
              className="w-full rounded-lg border border-theme-primary bg-transparent px-6 py-3 text-sm font-medium text-theme-muted transition-colors hover:border-theme-secondary hover:text-theme-secondary"
            >
              Start Conversation
            </button>
          </div>

          <p className="mt-6 text-xs text-theme-muted">
            You can change your workspace anytime from the pane header.
          </p>
        </div>
      </div>
    </div>
  );
}
