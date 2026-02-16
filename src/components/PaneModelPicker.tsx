import { useState, useEffect, useRef } from "react";
import { type ModelInfo, listModels } from "../lib/ipc";
import { useSessionStore } from "../stores/sessions";

interface PaneModelPickerProps {
  sessionId: string;
}

// Fallback models if IPC fails.
const FALLBACK_MODELS: ModelInfo[] = [
  { id: "opus", name: "Claude Opus", description: "Most capable" },
  { id: "sonnet", name: "Claude Sonnet", description: "Balanced" },
  { id: "haiku", name: "Claude Haiku", description: "Fastest" },
];

/**
 * Compact model picker for pane header.
 * Shows current model and allows switching per-session.
 */
export function PaneModelPicker({ sessionId }: PaneModelPickerProps) {
  const [models, setModels] = useState<ModelInfo[]>(FALLBACK_MODELS);
  const [isOpen, setIsOpen] = useState(false);
  const getSessionModel = useSessionStore((s) => s.getSessionModel);
  const setSessionModel = useSessionStore((s) => s.setSessionModel);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentModelId = getSessionModel(sessionId);

  useEffect(() => {
    listModels()
      .then((loaded) => {
        if (loaded.length > 0) {
          setModels(loaded);
        }
      })
      .catch((err) => {
        console.error("Failed to load models, using fallback:", err);
      });
  }, []);

  // Close dropdown on outside click.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  const currentModel = models.find((m) => m.id === currentModelId);
  const displayName = currentModel?.name ?? currentModelId;

  // Shorten display name for compact view.
  const shortName = displayName
    .replace("Claude ", "")
    .replace(" (Latest)", "");

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-theme-muted hover:bg-theme-tertiary hover:text-theme-secondary"
        title={`Model: ${displayName}`}
      >
        <span>{shortName}</span>
        <svg
          className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-52 rounded-lg border border-theme-primary bg-theme-tertiary py-1 shadow-xl">
          {models.map((model) => (
            <button
              key={model.id}
              onClick={(e) => {
                e.stopPropagation();
                setSessionModel(sessionId, model.id);
                setIsOpen(false);
              }}
              className={`flex w-full flex-col px-4 py-2 text-left text-sm hover:bg-theme-secondary ${
                model.id === currentModelId
                  ? "bg-blue-900/20 text-blue-300"
                  : "text-theme-secondary"
              }`}
            >
              <span className="font-medium">{model.name}</span>
              <span className="text-xs text-theme-muted">{model.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
