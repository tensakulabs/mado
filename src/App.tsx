import { useEffect, useState, useCallback } from "react";
import {
  type DaemonStatus,
  healthCheck,
  reconnect,
  isSetupComplete,
  onDaemonConnected,
  onDaemonError,
} from "./lib/ipc";
import { ApiKeySetup } from "./components/ApiKeySetup";
import { CommandPalette } from "./components/CommandPalette";
import { StatusBar } from "./components/StatusBar";
import { ContextualHints } from "./components/ContextualHints";
import { Settings } from "./components/Settings";
import { usePaneStore } from "./stores/panes";
import { useSessionStore } from "./stores/sessions";
import { useUiStore } from "./stores/ui";
import { Layout } from "./components/Layout";
import { SessionSidebar } from "./components/SessionSidebar";
import { Toolbar } from "./components/Toolbar";
import { useKeyboard } from "./hooks/useKeyboard";

type ConnectionState = "connecting" | "connected" | "disconnected";

/**
 * Convert raw error messages to user-friendly messages.
 */
function friendlyError(error: string): { title: string; detail: string; action?: string } {
  const err = String(error).toLowerCase();

  if (err.includes("no such file or directory") || err.includes("socket")) {
    return {
      title: "Cannot connect to Kobo",
      detail: "The Kobo daemon isn't running. Click Reconnect to start it.",
      action: "reconnect",
    };
  }

  if (err.includes("failed to start daemon") || err.includes("could not find kobo-daemon")) {
    return {
      title: "Daemon not found",
      detail: "The Kobo daemon binary is missing. Try rebuilding the app.",
    };
  }

  if (err.includes("connection refused")) {
    return {
      title: "Connection refused",
      detail: "The daemon may be starting up. Try reconnecting in a moment.",
      action: "reconnect",
    };
  }

  if (err.includes("permission denied")) {
    return {
      title: "Permission denied",
      detail: "Check that you have permission to access the Kobo socket.",
    };
  }

  // Fallback: show original error but sanitized.
  return {
    title: "Connection error",
    detail: err.length > 100 ? err.slice(0, 100) + "..." : err,
    action: "reconnect",
  };
}

function App() {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");
  const [daemonInfo, setDaemonInfo] = useState<DaemonStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [shellFallback, setShellFallback] = useState(false);
  const [needsApiKey, setNeedsApiKey] = useState<boolean | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const root = usePaneStore((s) => s.root);
  const initSinglePane = usePaneStore((s) => s.initSinglePane);
  const fetchSessions = useSessionStore((s) => s.fetchSessions);
  const loadUiConfig = useUiStore((s) => s.loadFromConfig);

  // Activate keyboard shortcuts with command palette integration.
  useKeyboard({
    onOpenCommandPalette: () => setCommandPaletteOpen(true),
  });

  // Load UI config (theme, font size, zoom) when daemon connects.
  useEffect(() => {
    if (connectionState === "connected") {
      loadUiConfig();
    }
  }, [connectionState, loadUiConfig]);

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

  // Initialize pane layout when daemon connects (no session yet - user picks workspace first).
  // Also fetches existing sessions from the daemon so they are available in the store.
  const ensureInitialPane = useCallback(() => {
    // Check if already initialized via store getter (avoids stale closure).
    const currentRoot = usePaneStore.getState().root;
    if (currentRoot) return; // Already initialized.
    // Fetch existing sessions from daemon so the store is populated.
    fetchSessions();
    // Create pane without session - welcome screen will handle session creation.
    initSinglePane();
  }, [initSinglePane, fetchSessions]);

  const handleReconnect = useCallback(async () => {
    setConnectionState("connecting");
    setErrorMessage(null);
    try {
      await reconnect();
      const healthy = await fetchHealth();
      if (healthy) {
        ensureInitialPane();
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
        ensureInitialPane();
      }
    });

    const unlistenError = onDaemonError((error) => {
      setConnectionState("disconnected");
      setErrorMessage(error);
    });

    // Initial health check, setup check, and pane initialization.
    (async () => {
      const healthy = await fetchHealth();
      if (healthy) {
        try {
          const setupDone = await isSetupComplete();
          setNeedsApiKey(!setupDone);
          if (setupDone) {
            ensureInitialPane();
          }
        } catch {
          // If setup check fails, show setup screen.
          setNeedsApiKey(true);
        }
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

  // Show API key setup if needed (no skip - must configure a provider).
  if (connectionState === "connected" && needsApiKey === true) {
    return (
      <ApiKeySetup
        onComplete={() => {
          setNeedsApiKey(false);
          ensureInitialPane();
        }}
      />
    );
  }

  // Show settings page (full page, not overlay).
  if (connectionState === "connected" && settingsOpen) {
    return (
      <Settings
        onBack={() => setSettingsOpen(false)}
        onResetSetup={() => {}}
      />
    );
  }

  // Show full multi-pane UI when connected with panes.
  if (connectionState === "connected" && root) {
    return (
      <div className="flex h-screen w-screen flex-col overflow-hidden">
        <Toolbar onOpenCommandPalette={() => setCommandPaletteOpen(true)} />
        {shellFallback && (
          <div className="flex items-center justify-between bg-yellow-900/30 px-3 py-1 text-xs text-yellow-300">
            <span>
              Claude CLI not found. Running in shell mode.{" "}
              <a
                href="https://docs.anthropic.com/en/docs/claude-cli"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-yellow-200"
              >
                Install Claude CLI
              </a>
            </span>
            <button
              onClick={() => setShellFallback(false)}
              className="ml-2 text-yellow-500 hover:text-yellow-300"
            >
              Dismiss
            </button>
          </div>
        )}
        <div className="flex flex-1 min-h-0">
          <SessionSidebar />
          <div className="flex-1 min-h-0">
            <Layout />
          </div>
        </div>
        <StatusBar
          version={daemonInfo?.version}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        {/* Command palette overlay (UX-01, UX-02, UX-03) */}
        <CommandPalette
          isOpen={commandPaletteOpen}
          onClose={() => setCommandPaletteOpen(false)}
          onOpenSettings={() => {
            setCommandPaletteOpen(false);
            setSettingsOpen(true);
          }}
        />

        {/* Contextual hints for new users (UX-08, UX-09) */}
        <ContextualHints enabled={true} />
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
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-8 p-8 bg-theme-primary">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-theme-primary">Kobo</h1>
        <p className="mt-2 text-sm text-theme-muted">
          Multi-pane AI conversations with persistence
        </p>
      </div>

      <div className="w-full max-w-md rounded-xl border border-theme-primary bg-theme-tertiary p-6 shadow-lg">
        <div className="mb-4 flex items-center gap-3">
          <div className={`h-3 w-3 rounded-full ${statusDot}`} />
          <span className={`text-lg font-medium ${statusColor}`}>
            {connectionState === "connecting" && "Connecting to daemon..."}
            {connectionState === "connected" && "Connected"}
            {connectionState === "disconnected" && "Disconnected"}
          </span>
        </div>

        {daemonInfo && connectionState === "connected" && (
          <div className="space-y-2 text-sm text-theme-secondary">
            <div className="flex justify-between">
              <span className="text-theme-muted">Version</span>
              <span>v{daemonInfo.version}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-theme-muted">PID</span>
              <span>{daemonInfo.pid}</span>
            </div>
          </div>
        )}

        {errorMessage && (() => {
          const friendly = friendlyError(errorMessage);
          return (
            <div className="mt-3 rounded-md bg-red-900/30 p-3">
              <p className="text-sm font-medium text-red-200">{friendly.title}</p>
              <p className="mt-1 text-xs text-red-300/80">{friendly.detail}</p>
            </div>
          );
        })()}

        {connectionState === "disconnected" && (
          <button
            onClick={handleReconnect}
            className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-theme-primary transition-colors hover:bg-blue-500"
          >
            Reconnect
          </button>
        )}
      </div>
    </div>
  );
}

export default App;
