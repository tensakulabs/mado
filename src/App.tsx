import { useEffect, useState, useCallback } from "react";
import {
  type DaemonStatus,
  healthCheck,
  reconnect,
  onDaemonConnected,
  onDaemonError,
} from "./lib/ipc";
import { usePaneStore } from "./stores/panes";
import { useSessionStore } from "./stores/sessions";
import { Layout } from "./components/Layout";
import { Toolbar } from "./components/Toolbar";
import { useKeyboard } from "./hooks/useKeyboard";

type ConnectionState = "connecting" | "connected" | "disconnected";

function App() {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");
  const [daemonInfo, setDaemonInfo] = useState<DaemonStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const root = usePaneStore((s) => s.root);
  const initSinglePane = usePaneStore((s) => s.initSinglePane);
  const createSession = useSessionStore((s) => s.createSession);

  // Activate keyboard shortcuts.
  useKeyboard();

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

  // Create initial session and pane when daemon connects.
  const ensureInitialPane = useCallback(async () => {
    if (root) return; // Already initialized.
    try {
      const session = await createSession("default", "sonnet", 24, 80);
      initSinglePane(session.id);
    } catch (err) {
      console.error("Failed to create initial session:", err);
      setErrorMessage(`Failed to create session: ${err}`);
    }
  }, [root, createSession, initSinglePane]);

  const handleReconnect = useCallback(async () => {
    setConnectionState("connecting");
    setErrorMessage(null);
    try {
      await reconnect();
      const healthy = await fetchHealth();
      if (healthy) {
        await ensureInitialPane();
      }
    } catch (err) {
      setConnectionState("disconnected");
      setErrorMessage(String(err));
    }
  }, [fetchHealth, ensureInitialPane]);

  useEffect(() => {
    // Listen for daemon connection events.
    const unlistenConnected = onDaemonConnected(async () => {
      const healthy = await fetchHealth();
      if (healthy) {
        await ensureInitialPane();
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
        await ensureInitialPane();
      }
    })();

    // Poll health every 30 seconds.
    const interval = setInterval(fetchHealth, 30000);

    return () => {
      clearInterval(interval);
      unlistenConnected.then((fn) => fn());
      unlistenError.then((fn) => fn());
    };
  }, [fetchHealth, ensureInitialPane]);

  // Show full multi-pane UI when connected with panes.
  if (connectionState === "connected" && root) {
    return (
      <div className="flex h-screen w-screen flex-col overflow-hidden">
        <Toolbar daemonInfo={daemonInfo} connectionState={connectionState} />
        <div className="flex-1 min-h-0">
          <Layout />
        </div>
      </div>
    );
  }

  // Show status/connection UI when not ready.
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
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-white">Kobo</h1>
        <p className="mt-2 text-sm text-gray-400">
          Chat-friendly tmux for AI conversations
        </p>
      </div>

      <div className="w-full max-w-md rounded-xl border border-gray-700/50 bg-[#16213e] p-6 shadow-lg">
        <div className="mb-4 flex items-center gap-3">
          <div className={`h-3 w-3 rounded-full ${statusDot}`} />
          <span className={`text-lg font-medium ${statusColor}`}>
            {connectionState === "connecting" && "Connecting to daemon..."}
            {connectionState === "connected" && "Connected"}
            {connectionState === "disconnected" && "Disconnected"}
          </span>
        </div>

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
          </div>
        )}

        {errorMessage && (
          <div className="mt-3 rounded-md bg-red-900/30 p-3 text-sm text-red-300">
            {errorMessage}
          </div>
        )}

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
