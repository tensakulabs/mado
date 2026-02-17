import { useState, useCallback } from "react";
import { setApiKey, updateConfig, getConfig, checkCliAuth, checkCliInstalled } from "../lib/ipc";

interface ApiKeySetupProps {
  onComplete: () => void;
}

interface Provider {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  keyPrefix?: string;
  keyPlaceholder?: string;
  docsUrl?: string;
  supportsCliLogin?: boolean;
}

type AuthMethod = "cli" | "api_key";
type SetupStep = "provider" | "auth_method" | "api_key";

const PROVIDERS: Provider[] = [
  {
    id: "claude",
    name: "Claude",
    description: "Anthropic",
    enabled: true,
    keyPrefix: "sk-ant-",
    keyPlaceholder: "sk-ant-...",
    docsUrl: "https://console.anthropic.com/settings/keys",
    supportsCliLogin: true,
  },
  {
    id: "gpt",
    name: "GPT",
    description: "OpenAI",
    enabled: false,
    keyPrefix: "sk-",
    keyPlaceholder: "sk-...",
  },
  {
    id: "gemini",
    name: "Gemini",
    description: "Google",
    enabled: false,
  },
  {
    id: "ollama",
    name: "Ollama",
    description: "Local",
    enabled: false,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "Gateway",
    enabled: false,
  },
];

/**
 * Provider selection and authentication setup screen.
 * For Claude, offers choice between CLI login (subscription) or API key.
 */
export function ApiKeySetup({ onComplete }: ApiKeySetupProps) {
  const [step, setStep] = useState<SetupStep>("provider");
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [_authMethod, setAuthMethod] = useState<AuthMethod | null>(null);
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleProviderSelect = useCallback((provider: Provider) => {
    if (!provider.enabled) return;
    setSelectedProvider(provider);
    setError(null);
    // If provider supports CLI login, show auth method choice
    if (provider.supportsCliLogin) {
      setStep("auth_method");
    } else {
      // Otherwise go straight to API key
      setStep("api_key");
    }
  }, []);

  const handleAuthMethodSelect = useCallback(async (method: AuthMethod) => {
    setAuthMethod(method);
    setError(null);

    if (method === "cli") {
      // CLI login - validate CLI is installed and logged in
      setSaving(true);
      try {
        // Check if Claude CLI is installed
        const cliPath = await checkCliInstalled();
        if (!cliPath) {
          setError("Claude CLI not installed. Run in terminal:\nnpm install -g @anthropic-ai/claude-cli");
          setSaving(false);
          return;
        }

        // Check if logged in
        const isLoggedIn = await checkCliAuth();
        if (!isLoggedIn) {
          setError("Not logged in. Run in terminal:\nclaude login");
          setSaving(false);
          return;
        }

        // All good - save config and complete
        const config = await getConfig();
        config.provider = selectedProvider!.id;
        config.auth_method = "cli";
        config.setup_complete = true;
        await updateConfig(config);
        onComplete();
      } catch (err) {
        setError(String(err));
        setSaving(false);
      }
    } else {
      // API key - show key input
      setStep("api_key");
    }
  }, [selectedProvider, onComplete]);

  const handleBack = useCallback(() => {
    if (step === "api_key" && selectedProvider?.supportsCliLogin) {
      setStep("auth_method");
      setAuthMethod(null);
    } else if (step === "api_key" || step === "auth_method") {
      setStep("provider");
      setSelectedProvider(null);
      setAuthMethod(null);
    }
    setKey("");
    setError(null);
  }, [step, selectedProvider]);

  const handleSaveApiKey = useCallback(async () => {
    if (!selectedProvider) return;

    if (!key.trim()) {
      setError("Please enter an API key");
      return;
    }

    if (selectedProvider.keyPrefix && !key.startsWith(selectedProvider.keyPrefix)) {
      setError(`API key should start with '${selectedProvider.keyPrefix}'`);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await setApiKey(key.trim());
      const config = await getConfig();
      config.provider = selectedProvider.id;
      config.auth_method = "api_key";
      config.setup_complete = true;
      await updateConfig(config);
      onComplete();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }, [key, selectedProvider, onComplete]);

  // Step 1: Provider selection
  if (step === "provider") {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-8 p-8 bg-theme-primary select-none">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-theme-primary">Mado</h1>
          <p className="mt-2 text-sm text-theme-muted">
            Choose your AI provider to get started
          </p>
        </div>

        <div className="flex w-full max-w-2xl gap-2">
          {PROVIDERS.map((provider) => (
            <button
              key={provider.id}
              onClick={() => handleProviderSelect(provider)}
              disabled={!provider.enabled}
              className={`relative flex flex-1 flex-col items-center rounded-lg border px-3 py-3 text-center transition-all ${
                provider.enabled
                  ? "border-blue-500/50 bg-theme-tertiary hover:border-blue-400 cursor-pointer"
                  : "cursor-not-allowed border-theme-secondary bg-theme-secondary opacity-50"
              }`}
            >
              <span className={`text-sm font-medium ${provider.enabled ? "text-theme-primary" : "text-theme-muted"}`}>
                {provider.name}
              </span>
              <span className="mt-0.5 text-[10px] text-theme-muted">
                {provider.enabled ? provider.description : "Soon"}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Step 2: Auth method selection (for providers that support CLI login)
  if (step === "auth_method" && selectedProvider) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-8 p-8 bg-theme-primary select-none">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-theme-primary">Mado</h1>
          <p className="mt-2 text-sm text-theme-muted">
            How do you want to authenticate?
          </p>
        </div>

        <div className="flex w-full max-w-md gap-3">
          <button
            onClick={() => handleAuthMethodSelect("cli")}
            disabled={saving}
            className="flex flex-1 flex-col items-center rounded-lg border border-blue-500/50 bg-theme-tertiary px-4 py-3 text-center transition-all hover:border-blue-400 cursor-pointer"
          >
            <span className="text-xl mb-1">👤</span>
            <span className="text-sm font-medium text-theme-primary">Subscription</span>
          </button>

          <button
            onClick={() => handleAuthMethodSelect("api_key")}
            disabled={saving}
            className="flex flex-1 flex-col items-center rounded-lg border border-theme-primary bg-theme-tertiary px-4 py-3 text-center transition-all hover:border-theme-secondary cursor-pointer"
          >
            <span className="text-xl mb-1">🔑</span>
            <span className="text-sm font-medium text-theme-primary">API Key</span>
          </button>
        </div>

        {error && (
          <div className="rounded-md bg-red-900/30 p-3 text-sm text-red-300 whitespace-pre-wrap font-mono">
            {error}
          </div>
        )}

        <button
          onClick={handleBack}
          className="text-sm text-theme-muted hover:text-theme-secondary"
        >
          ← Back to providers
        </button>
      </div>
    );
  }

  // Step 3: API key input
  if (step === "api_key" && selectedProvider) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-8 p-8 bg-theme-primary">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-theme-primary">Mado</h1>
          <p className="mt-2 text-sm text-theme-muted">
            Connect to {selectedProvider.name}
          </p>
        </div>

        <div className="w-full max-w-md rounded-xl border border-theme-primary bg-theme-tertiary p-6 shadow-lg">
          <p className="mb-4 text-sm text-theme-secondary">
            Enter your {selectedProvider.name} API key to start chatting.
          </p>

          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={selectedProvider.keyPlaceholder || "API key..."}
            className="w-full rounded-lg border border-theme-primary bg-theme-secondary px-4 py-2 text-sm text-theme-primary placeholder:text-theme-muted focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            onKeyDown={(e) => e.key === "Enter" && handleSaveApiKey()}
            autoFocus
          />

          {error && (
            <div className="mt-2 rounded-md bg-red-900/30 p-2 text-xs text-red-300">
              {error}
            </div>
          )}

          <div className="mt-4 flex gap-3">
            <button
              onClick={handleBack}
              className="rounded-lg border border-theme-primary px-4 py-2 text-sm text-theme-muted transition-colors hover:bg-theme-secondary"
            >
              Back
            </button>
            <button
              onClick={handleSaveApiKey}
              disabled={saving}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Connect"}
            </button>
          </div>

          {selectedProvider.docsUrl && (
            <div className="mt-4 text-center">
              <a
                href={selectedProvider.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                Get an API key from {selectedProvider.description}
              </a>
            </div>
          )}

          <p className="mt-4 text-xs text-theme-muted text-center">
            Your key is stored securely in the macOS Keychain (or libsecret on
            Linux). It never leaves your machine.
          </p>
        </div>
      </div>
    );
  }

  return null;
}
