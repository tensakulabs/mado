import { useCallback, useEffect, useState } from "react";
import { usePaneStore } from "../stores/panes";

const STORAGE_KEY = "mado-grid-layout";

export interface GridPreset {
  label: string;
  /** Ratios as percentages that sum to 100. For a 2-column split, [70, 30] means 70/30. */
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
  const columns = usePaneStore((s) => s.columns);
  const resizeColumns = usePaneStore((s) => s.resizeColumns);

  const stored = loadStoredLayout();
  const [activePreset, setActivePreset] = useState<string | null>(
    stored?.presetLabel ?? null,
  );
  const [percentages, setPercentages] = useState<number[]>(
    stored?.percentages ?? [50, 50],
  );

  // Sync from store: when columns change externally (drag resize), update local state.
  useEffect(() => {
    if (columns.length === 2) {
      const first = Math.round(columns[0].width);
      const second = Math.round(columns[1].width);
      setPercentages([first, second]);

      const matchingPreset = GRID_PRESETS.find(
        (p) => p.percentages[0] === first && p.percentages[1] === second,
      );
      setActivePreset(matchingPreset?.label ?? null);
    }
  }, [columns]);

  const applyPercentages = useCallback(
    (newPercentages: number[], presetLabel: string | null) => {
      if (columns.length < 2) return;

      // For a 2-column layout, set the ratio between columns 0 and 1.
      const ratio = newPercentages[0] / (newPercentages[0] + newPercentages[1]);
      resizeColumns(0, ratio);
      setPercentages(newPercentages);
      setActivePreset(presetLabel);
      saveLayout({ percentages: newPercentages, presetLabel });
    },
    [columns, resizeColumns],
  );

  const resetToEven = useCallback(() => {
    applyPercentages([50, 50], "Even");
  }, [applyPercentages]);

  const setCustomSplit = useCallback(
    (newPercentages: number[]) => {
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

  const hasSplit = columns.length >= 2;

  return {
    percentages,
    activePreset,
    hasSplit,
    resetToEven,
    setCustomSplit,
    applyPreset,
  };
}
