import { useEffect, useState, useCallback } from "react";
import {
  type DaemonStatus,
  type Session,
  healthCheck,
  reconnect,
  createSession,
  onDaemonConnected,
  onDaemonError,
} from "./lib/ipc";
import { TerminalPane } from "./components/Terminal";

type ConnectionState = "connecting" | "connected" | "disconnected";

function App() {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");
  const [daemonInfo, setDaemonInfo] = useState<DaemonStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<Session | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const status = await healthCheck();
      setDaemonInfo(status);
      setConnectionState("connected");
      setErrorMessage(null);
      return true;
    } catch (err) {
      setConnectionState("disconnected");
      setErrorMessage(String(err));
      return false;
    }
  }, []);

  // Create a default session when daemon connects.
  const ensureSession = useCallback(async () => {
    if (activeSession) return;
    try {
      const session = await createSession("default", "sonnet", 24, 80);
      setActiveSession(session);
    } catch (err) {
      console.error("Failed to create session:", err);
      setErrorMessage(`Failed to create session: ${err}`);
    }
  }, [activeSession]);

  const handleReconnect = useCallback(async () => {
    setConnectionState("connecting");
    setErrorMessage(null);
    try {
      await reconnect();
      const healthy = await fetchHealth();
      if (healthy) {
        await ensureSession();
      }
    } catch (err) {
      setConnectionState("disconnected");
      setErrorMessage(String(err));
    }
  }, [fetchHealth, ensureSession]);

  useEffect(() => {
    // Listen for daemon connection events from the Tauri backend.
    const unlistenConnected = onDaemonConnected(async () => {
      const healthy = await fetchHealth();
      if (healthy) {
        await ensureSession();
      }
    });

    const unlistenError = onDaemonError((error) => {
      setConnectionState("disconnected");
      setErrorMessage(error);
    });

    // Initial health check and session creation.
    (async () => {
      const healthy = await fetchHealth();
      if (healthy) {
        await ensureSession();
      }
    })();

    // Poll health every 30 seconds (less aggressive than before since we have a terminal).
    const interval = setInterval(fetchHealth, 30000);

    return () => {
      clearInterval(interval);
      unlistenConnected.then((fn) => fn());
      unlistenError.then((fn) => fn());
    };
  }, [fetchHealth, ensureSession]);

  const statusColor = {
    connecting: "text-yellow-400",
    connected: "text-green-400",
    disconnected: "text-red-400",
  }[connectionState];

  const statusDot = {
    connecting: "bg-yellow-400 animate-pulse",
    connected: "bg-green-400",
    disconnected: "bg-red-400",
  }[connectionState];

  // Show terminal when connected with an active session.
  if (connectionState === "connected" && activeSession) {
    return (
      <div className="flex h-screen w-screen flex-col overflow-hidden">
        {/* Status bar */}
        <div className="flex items-center justify-between border-b border-gray-700/50 bg-[#0a0a1a] px-3 py-1">
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${statusDot}`} />
            <span className="text-xs font-medium text-gray-400">Kobo</span>
            {daemonInfo && (
              <span className="text-xs text-gray-600">
                v{daemonInfo.version} | PID {daemonInfo.pid}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">
              {activeSession.name} ({activeSession.model})
            </span>
          </div>
        </div>

        {/* Terminal area */}
        <div className="flex-1">
          <TerminalPane sessionId={activeSession.id} />
        </div>
      </div>
    );
  }

  // Show status/connection UI when not connected or no session.
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-8 p-8">
      {/* Logo / Title */}
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-white">Kobo</h1>
        <p className="mt-2 text-sm text-gray-400">
          Chat-friendly tmux for AI conversations
        </p>
      </div>

      {/* Status Card */}
      <div className="w-full max-w-md rounded-xl border border-gray-700/50 bg-[#16213e] p-6 shadow-lg">
        {/* Connection Status */}
        <div className="mb-4 flex items-center gap-3">
          <div className={`h-3 w-3 rounded-full ${statusDot}`} />
          <span className={`text-lg font-medium ${statusColor}`}>
            {connectionState === "connecting" && "Connecting to daemon..."}
            {connectionState === "connected" && "Connected"}
            {connectionState === "disconnected" && "Disconnected"}
          </span>
        </div>

        {/* Daemon Info */}
        {daemonInfo && connectionState === "connected" && (
          <div className="space-y-2 text-sm text-gray-300">
            <div className="flex justify-between">
              <span className="text-gray-500">Version</span>
              <span>v{daemonInfo.version}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">PID</span>
              <span>{daemonInfo.pid}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Uptime</span>
              <span>{daemonInfo.uptime}s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Sessions</span>
              <span>{daemonInfo.session_count}</span>
            </div>
          </div>
        )}

        {/* Error Message */}
        {errorMessage && (
          <div className="mt-3 rounded-md bg-red-900/30 p-3 text-sm text-red-300">
            {errorMessage}
          </div>
        )}

        {/* Reconnect Button */}
        {connectionState === "disconnected" && (
          <button
            onClick={handleReconnect}
            className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
          >
            Reconnect
          </button>
        )}
      </div>
    </div>
  );
}

export default App;
