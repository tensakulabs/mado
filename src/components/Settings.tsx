import React, { useState, useCallback, useEffect } from "react";
import {
  getConfig,
  updateConfig,
  deleteApiKey,
  setApiKey,
  checkCliAuth,
  checkCliInstalled,
  getUserDisplayName,
  type MadoConfig,
} from "../lib/ipc";
import { useUiStore, THEME_PRESETS } from "../stores/ui";

interface SettingsProps {
  onBack: () => void;
  onResetSetup: () => void;
}

type SettingsSection = "account" | "appearance" | "shortcuts" | "about";
type ChangeStep = null | "provider" | "auth_method" | "api_key";

interface Provider {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  keyPrefix?: string;
  keyPlaceholder?: string;
  supportsCliLogin?: boolean;
}

const PROVIDERS: Provider[] = [
  {
    id: "claude",
    name: "Claude",
    description: "Anthropic",
    enabled: true,
    keyPrefix: "sk-ant-",
    keyPlaceholder: "sk-ant-...",
    supportsCliLogin: true,
  },
  { id: "gpt", name: "GPT", description: "OpenAI", enabled: false },
  { id: "gemini", name: "Gemini", description: "Google", enabled: false },
  { id: "ollama", name: "Ollama", description: "Local", enabled: false },
  { id: "openrouter", name: "OpenRouter", description: "Gateway", enabled: false },
];

const SECTIONS: { id: SettingsSection; label: string; icon: React.ReactNode }[] = [
  {
    id: "account",
    label: "Account",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  {
    id: "appearance",
    label: "Appearance",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
      </svg>
    ),
  },
  {
    id: "shortcuts",
    label: "Shortcuts",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" />
      </svg>
    ),
  },
  {
    id: "about",
    label: "About",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

/**
 * Full-page settings with sidebar navigation.
 */
export function Settings({ onBack }: SettingsProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>("account");
  const [config, setConfig] = useState<MadoConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Change provider flow state
  const [changeStep, setChangeStep] = useState<ChangeStep>(null);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [apiKey, setApiKeyValue] = useState("");

  // Load config on mount.
  useEffect(() => {
    (async () => {
      try {
        const cfg = await getConfig();
        setConfig(cfg);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleCancelChange = useCallback(() => {
    setChangeStep(null);
    setSelectedProvider(null);
    setApiKeyValue("");
    setError(null);
  }, []);

  const handleSaveApiKey = useCallback(async () => {
    if (!selectedProvider) return;

    if (!apiKey.trim()) {
      setError("Please enter an API key");
      return;
    }

    if (selectedProvider.keyPrefix && !apiKey.startsWith(selectedProvider.keyPrefix)) {
      setError(`API key should start with '${selectedProvider.keyPrefix}'`);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await setApiKey(apiKey.trim());
      const cfg = await getConfig();
      cfg.provider = selectedProvider.id;
      cfg.auth_method = "api_key";
      cfg.setup_complete = true;
      await updateConfig(cfg);
      setConfig(cfg);
      setChangeStep(null);
      setSelectedProvider(null);
      setApiKeyValue("");
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }, [apiKey, selectedProvider]);

  // UI store for appearance settings
  const uiTheme = useUiStore((s) => s.theme);
  const uiZoomLevel = useUiStore((s) => s.zoomLevel);
  const showToolCalls = useUiStore((s) => s.showToolCalls);
  const userName = useUiStore((s) => s.userName);
  const aiName = useUiStore((s) => s.aiName);
  const setTheme = useUiStore((s) => s.setTheme);
  const setZoomLevel = useUiStore((s) => s.setZoomLevel);
  const setShowToolCalls = useUiStore((s) => s.setShowToolCalls);
  const setUserName = useUiStore((s) => s.setUserName);
  const setAiName = useUiStore((s) => s.setAiName);

  // Handle auth method dropdown change
  const handleAuthMethodDropdownChange = useCallback(async (method: "cli" | "api_key") => {
    if (!selectedProvider) return;

    if (method === "api_key") {
      setChangeStep("api_key");
      return;
    }

    // Handle CLI auth
    setSaving(true);
    setError(null);
    try {
      const cliPath = await checkCliInstalled();
      if (!cliPath) {
        setError("Claude CLI not installed. Run in terminal:\nnpm install -g @anthropic-ai/claude-cli");
        setSaving(false);
        return;
      }

      const isLoggedIn = await checkCliAuth();
      if (!isLoggedIn) {
        setError("Not logged in. Run in terminal:\nclaude login");
        setSaving(false);
        return;
      }

      // Success - save and refresh config
      await deleteApiKey();
      const cfg = await getConfig();
      cfg.provider = selectedProvider.id;
      cfg.auth_method = "cli";
      cfg.setup_complete = true;
      await updateConfig(cfg);
      setConfig(cfg);
      setChangeStep(null);
      setSelectedProvider(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }, [selectedProvider]);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-theme-primary select-none">
        <div className="text-theme-muted">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen bg-theme-primary select-none">
      {/* Sidebar */}
      <div className="flex w-56 flex-col border-r border-theme-primary">
        {/* Header with back button */}
        <button
          onClick={onBack}
          className="flex w-full items-center gap-2 border-b border-theme-primary px-4 py-3 text-theme-muted hover:bg-theme-tertiary hover:text-theme-secondary"
          title="Back"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-sm font-medium">Settings</span>
        </button>

        {/* Navigation */}
        <nav className="flex-1 p-2">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                activeSection === section.id
                  ? "bg-theme-tertiary text-theme-primary font-medium"
                  : "text-theme-muted hover:bg-theme-tertiary hover:text-theme-secondary"
              }`}
            >
              {section.icon}
              {section.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-xl">
          {error && !changeStep && (
            <div className="mb-6 rounded-md bg-red-900/30 p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Account Section */}
          {activeSection === "account" && config && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-theme-primary">Account</h2>
                <p className="mt-1 text-sm text-theme-muted">Manage your provider and authentication</p>
              </div>

              {/* API key entry step */}
              {changeStep === "api_key" && selectedProvider ? (
                <div className="space-y-4 pb-4 border-b border-theme-primary">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-theme-primary">Enter {selectedProvider.name} API Key</h3>
                    <button
                      onClick={handleCancelChange}
                      className="text-xs text-theme-muted hover:text-theme-secondary"
                    >
                      Cancel
                    </button>
                  </div>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKeyValue(e.target.value)}
                    placeholder={selectedProvider.keyPlaceholder || "API key..."}
                    className="w-full rounded-lg border border-theme-primary bg-theme-secondary px-4 py-2 text-sm text-theme-primary placeholder:text-theme-muted focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    onKeyDown={(e) => e.key === "Enter" && handleSaveApiKey()}
                    autoFocus
                  />
                  {error && (
                    <div className="rounded-md bg-red-900/30 p-2 text-xs text-red-300 whitespace-pre-wrap font-mono">
                      {error}
                    </div>
                  )}
                  <button
                    onClick={handleSaveApiKey}
                    disabled={saving}
                    className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
              ) : (
                <div className="space-y-4 pb-4 border-b border-theme-primary">
                  {/* Provider dropdown */}
                  <div className="flex items-center justify-between py-3">
                    <div>
                      <div className="text-sm text-theme-primary">Provider</div>
                      <div className="mt-0.5 text-xs text-theme-muted">AI service to use</div>
                    </div>
                    <div className="relative">
                      <select
                        value={config.provider}
                        onChange={(e) => {
                          const provider = PROVIDERS.find(p => p.id === e.target.value);
                          if (provider) {
                            setSelectedProvider(provider);
                            if (provider.id !== config.provider) {
                              if (provider.supportsCliLogin) {
                                // Show auth method selection
                              } else {
                                setChangeStep("api_key");
                              }
                            }
                          }
                        }}
                        className="appearance-none rounded-lg border border-theme-primary bg-theme-secondary px-4 py-2 pr-8 text-sm text-theme-primary focus:border-blue-500 focus:outline-none cursor-pointer"
                      >
                        {PROVIDERS.filter(p => p.enabled).map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.name}
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                        <svg className="h-4 w-4 text-theme-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Auth method dropdown (only for providers with CLI support) */}
                  {PROVIDERS.find(p => p.id === config.provider)?.supportsCliLogin && (
                    <div className="flex items-center justify-between py-3">
                      <div>
                        <div className="text-sm text-theme-primary">Authentication</div>
                        <div className="mt-0.5 text-xs text-theme-muted">How to authenticate</div>
                      </div>
                      <div className="relative">
                        <select
                          value={config.auth_method}
                          onChange={(e) => {
                            const method = e.target.value as "cli" | "api_key";
                            const provider = PROVIDERS.find(p => p.id === config.provider);
                            if (provider) {
                              setSelectedProvider(provider);
                              handleAuthMethodDropdownChange(method);
                            }
                          }}
                          disabled={saving}
                          className="appearance-none rounded-lg border border-theme-primary bg-theme-secondary px-4 py-2 pr-8 text-sm text-theme-primary focus:border-blue-500 focus:outline-none cursor-pointer disabled:opacity-50"
                        >
                          <option value="cli">Subscription</option>
                          <option value="api_key">API Key</option>
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                          <svg className="h-4 w-4 text-theme-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  )}

                  {error && (
                    <div className="rounded-md bg-red-900/30 p-3 text-sm text-red-300 whitespace-pre-wrap font-mono">
                      {error}
                    </div>
                  )}
                </div>
              )}

              {/* Your Name */}
              <div className="flex items-center justify-between py-3 border-b border-theme-primary">
                <div>
                  <div className="text-sm text-theme-primary">Your Name</div>
                  <div className="mt-0.5 text-xs text-theme-muted">Display name in messages</div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    className="w-32 rounded-lg border border-theme-primary bg-theme-secondary px-3 py-1.5 text-sm text-theme-primary focus:border-blue-500 focus:outline-none"
                    placeholder="You"
                  />
                  <button
                    onClick={async () => {
                      const systemName = await getUserDisplayName().catch(() => "You");
                      setUserName(systemName);
                    }}
                    className="p-1.5 text-theme-muted hover:text-theme-primary cursor-pointer"
                    title="Reset to system name"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* AI Name */}
              <div className="flex items-center justify-between py-3">
                <div>
                  <div className="text-sm text-theme-primary">AI Name</div>
                  <div className="mt-0.5 text-xs text-theme-muted">Display name for assistant</div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={aiName}
                    onChange={(e) => setAiName(e.target.value)}
                    className="w-32 rounded-lg border border-theme-primary bg-theme-secondary px-3 py-1.5 text-sm text-theme-primary focus:border-blue-500 focus:outline-none"
                    placeholder="AI"
                  />
                  <button
                    onClick={() => setAiName("AI")}
                    className="p-1.5 text-theme-muted hover:text-theme-primary cursor-pointer"
                    title="Reset to default"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Appearance Section */}
          {activeSection === "appearance" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-theme-primary">Appearance</h2>
                <p className="mt-1 text-sm text-theme-muted">Customize how Kobo looks</p>
              </div>

              {/* Theme */}
              <div className="flex items-center justify-between py-3 border-b border-theme-primary">
                <div>
                  <div className="text-sm text-theme-primary">Theme</div>
                  <div className="mt-0.5 text-xs text-theme-muted">Choose your color scheme</div>
                </div>
                <div className="relative">
                  <select
                    value={uiTheme}
                    onChange={(e) => setTheme(e.target.value)}
                    className="appearance-none rounded-lg border border-theme-primary bg-theme-secondary px-4 py-2 pr-8 text-sm text-theme-primary focus:border-blue-500 focus:outline-none cursor-pointer"
                  >
                    {THEME_PRESETS.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.name}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                    <svg className="h-4 w-4 text-theme-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Display Size */}
              <div className="flex items-center justify-between py-3 border-b border-theme-primary">
                <div>
                  <div className="text-sm text-theme-primary">Display Size</div>
                  <div className="mt-0.5 text-xs text-theme-muted">Scale the interface (50-200%)</div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setZoomLevel(uiZoomLevel - 10)}
                    className="flex h-8 w-8 items-center justify-center rounded border border-theme-primary text-theme-muted hover:bg-theme-tertiary hover:text-theme-primary"
                  >
                    −
                  </button>
                  <span className="w-12 text-center text-sm font-medium text-theme-primary">
                    {uiZoomLevel}%
                  </span>
                  <button
                    onClick={() => setZoomLevel(uiZoomLevel + 10)}
                    className="flex h-8 w-8 items-center justify-center rounded border border-theme-primary text-theme-muted hover:bg-theme-tertiary hover:text-theme-primary"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Show Tool Calls */}
              <div className="flex items-center justify-between py-3">
                <div>
                  <div className="text-sm text-theme-primary">Show Tool Calls</div>
                  <div className="mt-0.5 text-xs text-theme-muted">Expand tool calls by default</div>
                </div>
                <button
                  onClick={() => setShowToolCalls(!showToolCalls)}
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    showToolCalls ? "bg-blue-600" : "bg-theme-secondary"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                      showToolCalls ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* Shortcuts Section */}
          {activeSection === "shortcuts" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-theme-primary">Keyboard Shortcuts</h2>
                <p className="mt-1 text-sm text-theme-muted">Quick actions with your keyboard</p>
              </div>

              {[
                { keys: "Cmd+K", action: "Open command palette" },
                { keys: "Ctrl+B c", action: "New conversation" },
                { keys: "Ctrl+B x", action: "Close conversation" },
                { keys: "Ctrl+B z", action: "Undo close" },
                { keys: 'Ctrl+B "', action: "Split horizontal" },
                { keys: "Ctrl+B %", action: "Split vertical" },
                { keys: "Ctrl+B ←→↑↓", action: "Navigate spaces" },
                { keys: "Ctrl +/-", action: "Zoom in/out" },
              ].map((shortcut, index, arr) => (
                <div key={shortcut.keys} className={`flex items-center justify-between py-3 ${index < arr.length - 1 ? 'border-b border-theme-primary' : ''}`}>
                  <span className="text-sm text-theme-secondary">{shortcut.action}</span>
                  <kbd className="rounded border border-theme-primary bg-theme-secondary px-2 py-1 text-xs text-theme-muted">
                    {shortcut.keys}
                  </kbd>
                </div>
              ))}
            </div>
          )}

          {/* About Section */}
          {activeSection === "about" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-theme-primary">Kobo</h2>
                <p className="mt-1 text-sm text-theme-muted">Version 0.1.0</p>
              </div>

              <div className="text-sm text-theme-muted space-y-3">
                <p>
                  A desktop app for AI conversations with multi-pane support,
                  session persistence, and local versioning.
                </p>
                <p>
                  Run multiple conversations side-by-side, split and arrange
                  spaces however you like, and pick up right where you left off.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
