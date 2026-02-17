import { useCallback, useEffect, useRef, useState } from "react";
import {
  GRID_PRESETS,
  useGridLayout,
} from "../hooks/useGridLayout";
import { Tooltip } from "./Tooltip";

/**
 * A small popover popup for selecting grid layout presets or fine-tuning
 * the split ratio with a slider. Triggered by a button in the Toolbar.
 */
export function GridResizePopup() {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const {
    percentages,
    activePreset,
    hasSplit,
    setCustomSplit,
    applyPreset,
  } = useGridLayout();

  // Local slider value for responsive feel before applying.
  const [sliderValue, setSliderValue] = useState(percentages[0]);

  // Sync slider when percentages change externally.
  useEffect(() => {
    setSliderValue(percentages[0]);
  }, [percentages]);

  // Close on outside click.
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Close on Escape.
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = Number(e.target.value);
      setSliderValue(value);
    },
    [],
  );

  const handleApplySlider = useCallback(() => {
    setCustomSplit([sliderValue, 100 - sliderValue]);
  }, [sliderValue, setCustomSplit]);

  if (!hasSplit) return null;

  return (
    <div className="relative">
      <Tooltip content="Grid Layout Presets">
        <button
          ref={buttonRef}
          onClick={() => setIsOpen((prev) => !prev)}
          className="rounded p-1 text-theme-muted hover:bg-theme-tertiary hover:text-theme-primary"
          aria-label="Grid Layout Presets"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="h-3.5 w-3.5"
          >
            <path
              fillRule="evenodd"
              d="M1 2.75A.75.75 0 0 1 1.75 2h3.5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-.75.75h-3.5A.75.75 0 0 1 1 6.25v-3.5Zm1.5.75v2h2v-2h-2ZM1 9.75A.75.75 0 0 1 1.75 9h3.5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-.75.75h-3.5a.75.75 0 0 1-.75-.75v-3.5Zm1.5.75v2h2v-2h-2ZM8 2.75A.75.75 0 0 1 8.75 2h3.5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-.75.75h-3.5A.75.75 0 0 1 8 6.25v-3.5Zm1.5.75v2h2v-2h-2ZM8 9.75A.75.75 0 0 1 8.75 9h3.5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-.75.75h-3.5a.75.75 0 0 1-.75-.75v-3.5Zm1.5.75v2h2v-2h-2Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </Tooltip>

      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-full z-50 mt-1 w-56 rounded-md border border-theme-primary bg-theme-secondary p-3 shadow-lg"
        >
          {/* Header */}
          <p className="mb-2 text-xs font-medium text-theme-primary">
            Layout Presets
          </p>

          {/* Preset buttons */}
          <div className="mb-3 grid grid-cols-2 gap-1.5">
            {GRID_PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => {
                  applyPreset(preset);
                }}
                className={`flex flex-col items-center gap-1 rounded px-2 py-1.5 text-xs transition-colors ${
                  activePreset === preset.label
                    ? "bg-blue-600/30 text-blue-300 ring-1 ring-blue-500/50"
                    : "text-theme-muted hover:bg-theme-tertiary hover:text-theme-primary"
                }`}
              >
                {/* Visual preview bar */}
                <PreviewBar
                  left={preset.percentages[0]}
                  right={preset.percentages[1]}
                  isActive={activePreset === preset.label}
                />
                <span>{preset.label}</span>
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="mb-2 h-px bg-theme-tertiary" />

          {/* Custom slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-theme-muted">Custom</span>
              <span className="text-xs tabular-nums text-theme-muted">
                {sliderValue}/{100 - sliderValue}
              </span>
            </div>

            {/* Preview bar for slider */}
            <PreviewBar
              left={sliderValue}
              right={100 - sliderValue}
              isActive={false}
              large
            />

            <input
              type="range"
              min={10}
              max={90}
              value={sliderValue}
              onChange={handleSliderChange}
              className="w-full accent-blue-500"
            />

            <button
              onClick={handleApplySlider}
              className="w-full rounded bg-blue-600/20 px-2 py-1 text-xs text-blue-300 transition-colors hover:bg-blue-600/30"
            >
              Apply {sliderValue}/{100 - sliderValue}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Visual preview showing the split ratio as two colored bars.
 */
function PreviewBar({
  left,
  right,
  isActive,
  large = false,
}: {
  left: number;
  right: number;
  isActive: boolean;
  large?: boolean;
}) {
  const height = large ? "h-3" : "h-2";
  const activeColor = isActive ? "bg-blue-500/60" : "bg-theme-muted/30";
  const secondColor = isActive ? "bg-blue-400/40" : "bg-theme-muted/15";

  return (
    <div className={`flex w-full gap-px overflow-hidden rounded ${height}`}>
      <div
        className={`rounded-l ${activeColor}`}
        style={{ width: `${left}%` }}
      />
      <div
        className={`rounded-r ${secondColor}`}
        style={{ width: `${right}%` }}
      />
    </div>
  );
}
