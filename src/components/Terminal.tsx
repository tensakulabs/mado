import { useTerminal } from "../hooks/useTerminal";

interface TerminalProps {
  sessionId: string | null;
}

/**
 * Terminal component that renders an xterm.js instance connected to a daemon session.
 *
 * Takes up full available space of its parent container.
 * Shows loading state while connecting, error state on failure.
 */
export function TerminalPane({ sessionId }: TerminalProps) {
  const { containerRef, isConnected, error } = useTerminal(sessionId);

  if (!sessionId) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-theme-secondary">
        <p className="text-sm text-theme-muted">No session selected</p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Terminal container -- always rendered so xterm can attach */}
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ display: isConnected || error ? "block" : "none" }}
      />

      {/* Loading overlay */}
      {!isConnected && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-theme-secondary">
          <div className="flex flex-col items-center gap-3">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-theme-primary border-t-blue-400" />
            <p className="text-sm text-theme-muted">Connecting to session...</p>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-theme-secondary">
          <div className="max-w-md rounded-lg bg-red-900/30 p-4 text-center">
            <p className="text-sm font-medium text-red-300">Connection Error</p>
            <p className="mt-1 text-xs text-red-400">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
