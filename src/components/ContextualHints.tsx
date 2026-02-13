import { useState, useEffect } from "react";

const HINTS_DISMISSED_KEY = "kobo-hints-dismissed";
const HINTS = [
  {
    id: "welcome",
    message:
      "Welcome to Kobo! Start typing to chat with Claude. Use Cmd+K to open the command palette.",
    showAfterMs: 1000,
  },
  {
    id: "split",
    message:
      'Tip: Split your space to run multiple conversations. Use the toolbar or press Ctrl+B then "',
    showAfterMs: 30000,
  },
  {
    id: "save",
    message:
      "Tip: Click \"save\" in a conversation header to create a milestone you can restore later.",
    showAfterMs: 60000,
  },
];

interface ContextualHintsProps {
  /** Whether to show hints at all. */
  enabled: boolean;
}

/**
 * Shows contextual hints for new users.
 * Hints appear on a timer and are dismissible.
 * Once dismissed, they stay dismissed (stored in localStorage).
 */
export function ContextualHints({ enabled }: ContextualHintsProps) {
  const [currentHint, setCurrentHint] = useState<
    (typeof HINTS)[0] | null
  >(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Load dismissed hints from localStorage.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(HINTS_DISMISSED_KEY);
      if (stored) {
        setDismissed(new Set(JSON.parse(stored)));
      }
    } catch {
      // Ignore parse errors.
    }
  }, []);

  // Set up hint timers.
  useEffect(() => {
    if (!enabled) return;

    const timers = HINTS.map((hint) => {
      return setTimeout(() => {
        setDismissed((prev) => {
          if (prev.has(hint.id)) return prev;
          setCurrentHint(hint);
          return prev;
        });
      }, hint.showAfterMs);
    });

    return () => timers.forEach(clearTimeout);
  }, [enabled, dismissed]);

  const dismissHint = (hintId: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(hintId);
      try {
        localStorage.setItem(
          HINTS_DISMISSED_KEY,
          JSON.stringify([...next]),
        );
      } catch {
        // Ignore storage errors.
      }
      return next;
    });
    setCurrentHint(null);
  };

  const dismissAll = () => {
    const allIds = new Set(HINTS.map((h) => h.id));
    setDismissed(allIds);
    try {
      localStorage.setItem(
        HINTS_DISMISSED_KEY,
        JSON.stringify([...allIds]),
      );
    } catch {
      // Ignore.
    }
    setCurrentHint(null);
  };

  if (!currentHint || dismissed.has(currentHint.id)) return null;

  return (
    <div className="fixed bottom-10 left-1/2 z-40 -translate-x-1/2 transform">
      <div className="flex items-center gap-3 rounded-lg border border-blue-800/30 bg-blue-900/40 px-4 py-2 shadow-lg backdrop-blur-sm">
        <span className="text-xs text-blue-200">{currentHint.message}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => dismissHint(currentHint.id)}
            className="rounded px-1.5 py-0.5 text-[10px] text-blue-400 hover:bg-blue-800/30"
          >
            Got it
          </button>
          <button
            onClick={dismissAll}
            className="rounded px-1.5 py-0.5 text-[10px] text-gray-500 hover:text-gray-300"
          >
            Hide all
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Reset all dismissed hints (for testing or user preference).
 */
export function resetHints() {
  localStorage.removeItem(HINTS_DISMISSED_KEY);
}
