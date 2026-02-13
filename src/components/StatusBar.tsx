import { usePaneStore } from "../stores/panes";
import { useSessionStore } from "../stores/sessions";

interface StatusBarProps {
  connectionState: "connecting" | "connected" | "disconnected";
}

/**
 * Bottom status bar showing model, connection status, and keyboard hints.
 * Uses "Conversations" and "Spaces" vocabulary.
 */
export function StatusBar({ connectionState }: StatusBarProps) {
  const defaultModel = useSessionStore((s) => s.defaultModel);
  const getLeaves = usePaneStore((s) => s.getLeaves);
  const activePaneId = usePaneStore((s) => s.activePaneId);

  const leaves = getLeaves();
  const activeLeaf = leaves.find((l) => l.id === activePaneId);
  const getSession = useSessionStore((s) => s.getSession);
  const activeSession = activeLeaf
    ? getSession(activeLeaf.sessionId)
    : undefined;

  const connectionDot = {
    connecting: "bg-yellow-400 animate-pulse",
    connected: "bg-green-400",
    disconnected: "bg-red-400",
  }[connectionState];

  const connectionText = {
    connecting: "Connecting...",
    connected: "Connected",
    disconnected: "Disconnected",
  }[connectionState];

  const modelName = {
    opus: "Claude Opus",
    sonnet: "Claude Sonnet",
    haiku: "Claude Haiku",
  }[defaultModel] ?? defaultModel;

  return (
    <div className="flex items-center justify-between border-t border-gray-700/30 bg-[#0a0f1e] px-3 py-0.5 text-[10px] text-gray-500">
      {/* Left: connection + model */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <div className={`h-1.5 w-1.5 rounded-full ${connectionDot}`} />
          <span>{connectionText}</span>
        </div>
        <span className="text-gray-600">|</span>
        <span>{modelName}</span>
        {activeSession?.shell_fallback && (
          <>
            <span className="text-gray-600">|</span>
            <span className="text-yellow-500">Shell mode</span>
          </>
        )}
      </div>

      {/* Center: active conversation info */}
      <div className="flex items-center gap-2">
        <span>
          {leaves.length} conversation{leaves.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Right: keyboard hints */}
      <div className="flex items-center gap-2">
        <span>
          <kbd className="rounded border border-gray-700/50 px-1 text-gray-600">
            Cmd+K
          </kbd>{" "}
          Commands
        </span>
        <span>
          <kbd className="rounded border border-gray-700/50 px-1 text-gray-600">
            Ctrl+B
          </kbd>{" "}
          Shortcuts
        </span>
      </div>
    </div>
  );
}
