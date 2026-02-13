import { useCallback, useState } from "react";
import { ChatView } from "./ChatView";
import { Timeline } from "./Timeline";
import { ChangeDetails } from "./ChangeDetails";
import { usePaneStore } from "../stores/panes";
import { useSessionStore } from "../stores/sessions";
import { useVersioning } from "../hooks/useVersioning";
import { useChangeIndicator } from "../hooks/useChangeIndicator";

interface PaneProps {
  paneId: string;
  sessionId: string;
}

/**
 * Wraps a ChatView component with pane chrome (border, header, focus state).
 * Includes save button, timeline toggle, and real-time change indicator.
 */
export function Pane({ paneId, sessionId }: PaneProps) {
  const activePaneId = usePaneStore((s) => s.activePaneId);
  const focusPane = usePaneStore((s) => s.focusPane);
  const closePane = usePaneStore((s) => s.closePane);
  const getSession = useSessionStore((s) => s.getSession);

  const [showTimeline, setShowTimeline] = useState(false);
  const [showChangeDetails, setShowChangeDetails] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const { save, isSaving, error: versionError, clearError } = useVersioning();
  const {
    insertions,
    deletions,
    files,
    refresh: refreshChanges,
  } = useChangeIndicator(sessionId);

  const isActive = activePaneId === paneId;
  const session = getSession(sessionId);
  const hasChanges = insertions > 0 || deletions > 0;

  const handleFocus = useCallback(() => {
    focusPane(paneId);
  }, [paneId, focusPane]);

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      closePane(paneId);
    },
    [paneId, closePane],
  );

  const handleSave = useCallback(async () => {
    const message = `Milestone ${new Date().toLocaleTimeString()}`;
    const milestone = await save(sessionId, message);
    if (milestone) {
      setSaveMessage("Saved!");
      // Refresh change indicator immediately after save (CHNG-04).
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
      setShowChangeDetails((prev) => !prev);
    },
    [],
  );

  return (
    <div
      className={`flex h-full w-full flex-col overflow-hidden ${
        isActive
          ? "ring-1 ring-blue-500/60"
          : "ring-1 ring-gray-700/30"
      }`}
      onMouseDown={handleFocus}
    >
      {/* Pane header */}
      <div
        className={`flex items-center justify-between px-2 py-0.5 text-xs ${
          isActive
            ? "bg-blue-900/30 text-gray-300"
            : "bg-gray-900/50 text-gray-500"
        }`}
      >
        <div className="flex items-center gap-2 truncate">
          <span className="truncate font-medium">
            {session?.name ?? "Session"}
          </span>
          <span className="text-gray-600">
            {session?.model ?? ""}
          </span>
          {/* Change indicator - clickable for file breakdown (CHNG-01, CHNG-03) */}
          <div className="relative">
            <button
              onClick={toggleChangeDetails}
              className={`font-mono text-[10px] rounded px-0.5 transition-colors ${
                hasChanges
                  ? "text-yellow-400 hover:bg-yellow-900/30"
                  : "text-gray-600 hover:bg-gray-800/50"
              }`}
              title={
                hasChanges
                  ? `${files.length} file${files.length !== 1 ? "s" : ""} changed - click for details`
                  : "No uncommitted changes"
              }
            >
              [+{insertions} -{deletions}]
            </button>
            {showChangeDetails && (
              <ChangeDetails
                files={files}
                totalInsertions={insertions}
                totalDeletions={deletions}
                onClose={() => setShowChangeDetails(false)}
              />
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* Save feedback */}
          {saveMessage && (
            <span className="text-[10px] text-green-400">{saveMessage}</span>
          )}
          {versionError && (
            <span
              className="text-[10px] text-yellow-400 cursor-pointer"
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
            className={`rounded px-1.5 py-0.5 text-[10px] ${
              isSaving
                ? "text-gray-600"
                : "text-gray-500 hover:bg-green-900/30 hover:text-green-400"
            }`}
            title="Save milestone"
          >
            {isSaving ? "..." : "save"}
          </button>
          {/* Timeline toggle */}
          <button
            onClick={toggleTimeline}
            className={`rounded px-1.5 py-0.5 text-[10px] ${
              showTimeline
                ? "bg-blue-900/30 text-blue-400"
                : "text-gray-500 hover:bg-gray-800 hover:text-gray-300"
            }`}
            title="Toggle timeline"
          >
            history
          </button>
          {/* Close button */}
          <button
            onClick={handleClose}
            className="rounded px-1 text-gray-500 hover:bg-red-900/30 hover:text-red-400"
            title="Close pane (Ctrl+B x)"
          >
            x
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* Chat area */}
        <div className="flex-1 min-h-0">
          <ChatView sessionId={sessionId} />
        </div>

        {/* Timeline sidebar */}
        {showTimeline && (
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
