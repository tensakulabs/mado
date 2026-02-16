import { useMemo, useEffect, useState } from "react";
import { usePaneStore } from "../stores/panes";
import { useSessionStore } from "../stores/sessions";
import { useUiStore } from "../stores/ui";
import { getUserDisplayName } from "../lib/ipc";

interface StatusBarProps {
  version?: string;
  onOpenSettings: () => void;
}

/**
 * Bottom status bar showing version and keyboard hints.
 */
export function StatusBar({ version, onOpenSettings }: StatusBarProps) {
  const root = usePaneStore((s) => s.root);
  const activePaneId = usePaneStore((s) => s.activePaneId);
  const getSession = useSessionStore((s) => s.getSession);
  const zoomLevel = useUiStore((s) => s.zoomLevel);
  const [userName, setUserName] = useState("User");

  // Fetch user's display name on mount.
  useEffect(() => {
    getUserDisplayName().then(setUserName).catch(() => {});
  }, []);

  // Memoize leaf computation to avoid infinite loop.
  const { activeLeaf, conversationCount } = useMemo(() => {
    if (!root) return { activeLeaf: undefined, conversationCount: 0 };
    const collectLeaves = (node: typeof root): typeof root extends { type: "leaf" } ? [typeof root] : never[] => {
      if (!node) return [] as never[];
      if (node.type === "leaf") return [node] as never[];
      return [...collectLeaves(node.children[0]), ...collectLeaves(node.children[1])] as never[];
    };
    const allLeaves = collectLeaves(root);
    const active = allLeaves.find((l: { id: string }) => l.id === activePaneId);
    // Count only leaves with active sessions
    const withSessions = allLeaves.filter((l: { sessionId?: string }) => !!l.sessionId).length;
    return { activeLeaf: active, conversationCount: withSessions };
  }, [root, activePaneId]);

  const activeSession = activeLeaf
    ? getSession((activeLeaf as { sessionId: string }).sessionId)
    : undefined;

  return (
    <div className="flex items-center border-t border-theme-primary bg-theme-secondary px-5 py-2 text-sm text-theme-muted select-none">
      {/* Left: user panel + version */}
      <div className="flex flex-1 items-center gap-3">
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-2 border-r border-theme-primary pr-3 py-1 text-theme-muted hover:text-theme-primary"
          title="Settings"
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-theme-tertiary text-[10px] font-medium text-theme-primary">
            {userName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <span className="text-xs">{userName}</span>
          <svg className="h-3 w-3 text-theme-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
          </svg>
        </button>
        {version && (
          <span className="text-xs text-theme-muted">v{version}</span>
        )}
        {activeSession?.shell_fallback && (
          <>
            <span className="text-theme-muted">|</span>
            <span className="text-yellow-500">Shell mode</span>
          </>
        )}
      </div>

      {/* Center: conversation count (only show when there are active sessions) */}
      <div className="flex items-center justify-center text-theme-secondary">
        {conversationCount > 0 && (
          <span>
            {conversationCount} conversation{conversationCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Right: keyboard hints */}
      <div className="flex flex-1 items-center justify-end gap-4">
        <span className="flex items-center gap-1.5">
          <kbd className="rounded border border-theme-primary bg-theme-tertiary px-2 py-0.5 text-xs text-theme-muted">
            Cmd+G
          </kbd>
          Git
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className="rounded border border-theme-primary bg-theme-tertiary px-2 py-0.5 text-xs text-theme-muted">
            Cmd+K
          </kbd>
          Commands
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className="rounded border border-theme-primary bg-theme-tertiary px-2 py-0.5 text-xs text-theme-muted">
            Ctrl+/-
          </kbd>
          {zoomLevel}%
        </span>
      </div>
    </div>
  );
}
