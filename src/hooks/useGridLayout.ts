import { useCallback, useEffect, useState } from "react";
import { usePaneStore } from "../stores/panes";

const STORAGE_KEY = "mado-grid-layout";

export interface GridPreset {
  label: string;
  /** Ratios as percentages that sum to 100. For a 2-pane split, [70, 30] means 70/30. */
  percentages: number[];
}

export const GRID_PRESETS: GridPreset[] = [
  { label: "Even", percentages: [50, 50] },
  { label: "70/30", percentages: [70, 30] },
  { label: "30/70", percentages: [30, 70] },
  { label: "60/40", percentages: [60, 40] },
];

interface StoredLayout {
  percentages: number[];
  presetLabel: string | null;
}

function loadStoredLayout(): StoredLayout | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredLayout;
  } catch {
    return null;
  }
}

function saveLayout(layout: StoredLayout): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // localStorage might be full or unavailable; silently ignore.
  }
}

export function useGridLayout() {
  const root = usePaneStore((s) => s.root);
  const resizePane = usePaneStore((s) => s.resizePane);

  const stored = loadStoredLayout();
  const [activePreset, setActivePreset] = useState<string | null>(
    stored?.presetLabel ?? null,
  );
  const [percentages, setPercentages] = useState<number[]>(
    stored?.percentages ?? [50, 50],
  );

  // Sync from store: when root changes externally (drag resize), update local state.
  useEffect(() => {
    if (root?.type === "split") {
      const first = Math.round(root.ratio * 100);
      const second = 100 - first;
      setPercentages([first, second]);

      // Check if current ratio matches a preset.
      const matchingPreset = GRID_PRESETS.find(
        (p) => p.percentages[0] === first && p.percentages[1] === second,
      );
      setActivePreset(matchingPreset?.label ?? null);
    }
  }, [root]);

  const applyPercentages = useCallback(
    (newPercentages: number[], presetLabel: string | null) => {
      if (!root || root.type !== "split") return;

      const ratio = newPercentages[0] / 100;
      resizePane(root.id, ratio);
      setPercentages(newPercentages);
      setActivePreset(presetLabel);
      saveLayout({ percentages: newPercentages, presetLabel });
    },
    [root, resizePane],
  );

  const resetToEven = useCallback(() => {
    applyPercentages([50, 50], "Even");
  }, [applyPercentages]);

  const setCustomSplit = useCallback(
    (newPercentages: number[]) => {
      // Check if this matches any preset.
      const matchingPreset = GRID_PRESETS.find(
        (p) =>
          p.percentages[0] === newPercentages[0] &&
          p.percentages[1] === newPercentages[1],
      );
      applyPercentages(newPercentages, matchingPreset?.label ?? null);
    },
    [applyPercentages],
  );

  const applyPreset = useCallback(
    (preset: GridPreset) => {
      applyPercentages(preset.percentages, preset.label);
    },
    [applyPercentages],
  );

  const hasSplit = root?.type === "split";

  return {
    percentages,
    activePreset,
    hasSplit,
    resetToEven,
    setCustomSplit,
    applyPreset,
  };
}
