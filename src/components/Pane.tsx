import { useCallback } from "react";
import { TerminalPane } from "./Terminal";
import { usePaneStore } from "../stores/panes";
import { useSessionStore } from "../stores/sessions";

interface PaneProps {
  paneId: string;
  sessionId: string;
}

/**
 * Wraps a Terminal component with pane chrome (border, header, focus state).
 */
export function Pane({ paneId, sessionId }: PaneProps) {
  const activePaneId = usePaneStore((s) => s.activePaneId);
  const focusPane = usePaneStore((s) => s.focusPane);
  const closePane = usePaneStore((s) => s.closePane);
  const getSession = useSessionStore((s) => s.getSession);

  const isActive = activePaneId === paneId;
  const session = getSession(sessionId);

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
          {/* Change indicator placeholder */}
          <span className="text-gray-600 font-mono text-[10px]">
            [+0 -0]
          </span>
        </div>
        <button
          onClick={handleClose}
          className="ml-2 rounded px-1 text-gray-500 hover:bg-red-900/30 hover:text-red-400"
          title="Close pane (Ctrl+B x)"
        >
          x
        </button>
      </div>

      {/* Terminal area */}
      <div className="flex-1 min-h-0">
        <TerminalPane sessionId={sessionId} />
      </div>
    </div>
  );
}
