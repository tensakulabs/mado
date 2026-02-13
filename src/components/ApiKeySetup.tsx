import { useState, useCallback } from "react";
import { setApiKey } from "../lib/ipc";

interface ApiKeySetupProps {
  onComplete: () => void;
  onSkip: () => void;
}

/**
 * API key setup screen shown when no Anthropic API key is configured.
 * Allows users to enter their key or skip to shell-only mode.
 */
export function ApiKeySetup({ onComplete, onSkip }: ApiKeySetupProps) {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (!key.trim()) {
      setError("Please enter an API key");
      return;
    }

    if (!key.startsWith("sk-ant-")) {
      setError("API key should start with 'sk-ant-'");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await setApiKey(key.trim());
      onComplete();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }, [key, onComplete]);

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-white">Kobo</h1>
        <p className="mt-2 text-sm text-gray-400">
          Set up your Anthropic API key
        </p>
      </div>

      <div className="w-full max-w-md rounded-xl border border-gray-700/50 bg-[#16213e] p-6 shadow-lg">
        <p className="mb-4 text-sm text-gray-300">
          Kobo uses the Claude CLI to power conversations. Enter your Anthropic
          API key to get started.
        </p>

        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-ant-..."
          className="w-full rounded-lg border border-gray-600/50 bg-[#0f0f23] px-4 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          autoFocus
        />

        {error && (
          <div className="mt-2 rounded-md bg-red-900/30 p-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="mt-4 flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Key"}
          </button>
        </div>

        <div className="mt-4 flex items-center justify-between text-xs">
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300"
          >
            Get an API key
          </a>
          <button
            onClick={onSkip}
            className="text-gray-500 hover:text-gray-400"
          >
            Skip (shell only)
          </button>
        </div>

        <p className="mt-4 text-xs text-gray-600">
          Your key is stored securely in the macOS Keychain (or libsecret on
          Linux). It never leaves your machine.
        </p>
      </div>
    </div>
  );
}
