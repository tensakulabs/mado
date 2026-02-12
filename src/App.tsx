import { useEffect, useState, useCallback } from "react";
import {
  type DaemonStatus,
  healthCheck,
  reconnect,
  onDaemonConnected,
  onDaemonError,
} from "./lib/ipc";

type ConnectionState = "connecting" | "connected" | "disconnected";

function App() {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");
  const [daemonInfo, setDaemonInfo] = useState<DaemonStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const status = await healthCheck();
      setDaemonInfo(status);
      setConnectionState("connected");
      setErrorMessage(null);
    } catch (err) {
      setConnectionState("disconnected");
      setErrorMessage(String(err));
    }
  }, []);

  const handleReconnect = useCallback(async () => {
    setConnectionState("connecting");
    setErrorMessage(null);
    try {
      await reconnect();
      await fetchHealth();
    } catch (err) {
      setConnectionState("disconnected");
      setErrorMessage(String(err));
    }
  }, [fetchHealth]);

  useEffect(() => {
    // Listen for daemon connection events from the Tauri backend.
    const unlistenConnected = onDaemonConnected(() => {
      fetchHealth();
    });

    const unlistenError = onDaemonError((error) => {
      setConnectionState("disconnected");
      setErrorMessage(error);
    });

    // Poll health every 5 seconds as a heartbeat.
    const interval = setInterval(fetchHealth, 5000);

    // Initial health check.
    fetchHealth();

    return () => {
      clearInterval(interval);
      unlistenConnected.then((fn) => fn());
      unlistenError.then((fn) => fn());
    };
  }, [fetchHealth]);

  const formatUptime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

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

  return (
    <div className="flex flex-col items-center justify-center gap-8 p-8">
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
        <div className="flex items-center gap-3 mb-4">
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
              <span>{formatUptime(daemonInfo.uptime)}</span>
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

      {/* Footer */}
      <p className="text-xs text-gray-600">
        Kobo v0.1.0 | Foundation Phase
      </p>
    </div>
  );
}

export default App;
