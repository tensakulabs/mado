import { useState, useEffect, useRef } from "react";
import { type ModelInfo, listModels } from "../lib/ipc";
import { useSessionStore } from "../stores/sessions";

/**
 * Dropdown model picker for the toolbar.
 * Shows available Claude models and lets users select the default.
 */
export function ModelPicker() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const defaultModel = useSessionStore((s) => s.defaultModel);
  const setDefaultModel = useSessionStore((s) => s.setDefaultModel);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listModels()
      .then(setModels)
      .catch((err) => console.error("Failed to load models:", err));
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

  const currentModel = models.find((m) => m.id === defaultModel);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-theme-muted hover:bg-theme-tertiary hover:text-theme-primary"
        title="Select model"
      >
        <span className="font-medium">
          {currentModel?.name ?? defaultModel}
        </span>
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
        <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border border-theme-primary bg-theme-tertiary py-1 shadow-xl">
          {models.map((model) => (
            <button
              key={model.id}
              onClick={() => {
                setDefaultModel(model.id);
                setIsOpen(false);
              }}
              className={`flex w-full flex-col px-3 py-2 text-left text-xs hover:bg-theme-secondary ${
                model.id === defaultModel
                  ? "bg-blue-900/20 text-blue-300"
                  : "text-theme-secondary"
              }`}
            >
              <span className="font-medium">{model.name}</span>
              <span className="mt-0.5 text-theme-muted">{model.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
