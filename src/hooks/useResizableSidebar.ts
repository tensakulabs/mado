import { useState, useCallback, useEffect, useRef } from "react";

const MIN_WIDTH = 200;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 224; // matches Tailwind w-56 (14rem)

function clampWidth(w: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w));
}

function loadPersistedWidth(storageKey: string): number {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const parsed = Number(stored);
      if (Number.isFinite(parsed)) return clampWidth(parsed);
    }
  } catch {
    // localStorage may be unavailable.
  }
  return DEFAULT_WIDTH;
}

interface ResizableSidebarOptions {
  /** localStorage key for persisting width. */
  storageKey?: string;
  /** Which side the panel is on — affects drag direction. */
  side?: "left" | "right";
}

/**
 * Hook that provides drag-to-resize behaviour for a sidebar panel.
 *
 * Returns:
 *  - `width`           current sidebar width in px
 *  - `handleMouseDown` attach to the resize handle's onMouseDown
 *  - `isResizing`      true while the user is actively dragging
 */
export function useResizableSidebar(options?: ResizableSidebarOptions) {
  const storageKey = options?.storageKey ?? "mado-sidebar-width";
  const side = options?.side ?? "left";

  const [width, setWidth] = useState(() => loadPersistedWidth(storageKey));
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
      // For right-side panels, dragging left (negative delta) should increase width.
      const newWidth = clampWidth(
        side === "right"
          ? startWidthRef.current - delta
          : startWidthRef.current + delta,
      );
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      // Persist final width.
      try {
        localStorage.setItem(storageKey, String(width));
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
  }, [isResizing, width, side, storageKey]);

  // Persist on every width change (debounced via effect).
  useEffect(() => {
    if (isResizing) return; // Will persist on mouseUp.
    try {
      localStorage.setItem(storageKey, String(width));
    } catch {
      // Ignore.
    }
  }, [width, isResizing, storageKey]);

  return { width, handleMouseDown, isResizing } as const;
}
