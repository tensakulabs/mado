import { useState, useCallback, useEffect, useRef } from "react";

const STORAGE_KEY = "mado-sidebar-width";
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 224; // matches Tailwind w-56 (14rem)

function clampWidth(w: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w));
}

function loadPersistedWidth(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = Number(stored);
      if (Number.isFinite(parsed)) return clampWidth(parsed);
    }
  } catch {
    // localStorage may be unavailable.
  }
  return DEFAULT_WIDTH;
}

/**
 * Hook that provides drag-to-resize behaviour for the sidebar.
 *
 * Returns:
 *  - `width`           current sidebar width in px
 *  - `handleMouseDown` attach to the resize handle's onMouseDown
 *  - `isResizing`      true while the user is actively dragging
 */
export function useResizableSidebar() {
  const [width, setWidth] = useState(loadPersistedWidth);
  const [isResizing, setIsResizing] = useState(false);

  // Track start position so we can compute deltas.
  const startXRef = useRef(0);
  const startWidthRef = useRef(width);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startXRef.current = e.clientX;
      startWidthRef.current = width;
      setIsResizing(true);
    },
    [width],
  );

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current;
      const newWidth = clampWidth(startWidthRef.current + delta);
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      // Persist final width.
      try {
        localStorage.setItem(STORAGE_KEY, String(width));
      } catch {
        // Ignore persistence failures.
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, width]);

  // Persist on every width change (debounced via effect).
  useEffect(() => {
    if (isResizing) return; // Will persist on mouseUp.
    try {
      localStorage.setItem(STORAGE_KEY, String(width));
    } catch {
      // Ignore.
    }
  }, [width, isResizing]);

  return { width, handleMouseDown, isResizing } as const;
}
