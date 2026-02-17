import { ReactNode, useState, useRef, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  content: string;
  children: ReactNode;
  position?: "top" | "bottom" | "right";
  align?: "center" | "end";
}

/**
 * Portal-based tooltip that appears on hover.
 * Renders on document.body so it's never clipped by overflow:hidden.
 * Uses useLayoutEffect to measure and clamp position within viewport.
 */
export function Tooltip({ content, children, position = "top", align = "center" }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const show = useCallback(() => setVisible(true), []);
  const hide = useCallback(() => {
    setVisible(false);
    setPos({});
  }, []);

  useLayoutEffect(() => {
    if (!visible || !triggerRef.current || !tooltipRef.current) return;

    const tr = triggerRef.current.getBoundingClientRect();
    const tt = tooltipRef.current.getBoundingClientRect();
    const MARGIN = 8;
    const GAP = 6;

    let top: number;
    let left: number;

    if (position === "bottom") {
      top = tr.bottom + GAP;
      left = align === "end"
        ? tr.right - tt.width
        : tr.left + tr.width / 2 - tt.width / 2;
    } else if (position === "right") {
      top = tr.top + tr.height / 2 - tt.height / 2;
      left = tr.right + GAP;
    } else {
      top = tr.top - tt.height - GAP;
      left = align === "end"
        ? tr.right - tt.width
        : tr.left + tr.width / 2 - tt.width / 2;
    }

    // Clamp to viewport
    if (left + tt.width > window.innerWidth - MARGIN) {
      left = window.innerWidth - tt.width - MARGIN;
    }
    if (left < MARGIN) left = MARGIN;
    if (top + tt.height > window.innerHeight - MARGIN) {
      top = window.innerHeight - tt.height - MARGIN;
    }
    if (top < MARGIN) top = MARGIN;

    setPos({
      top,
      left,
      visibility: "visible",
    });
  }, [visible, position, align]);

  return (
    <span ref={triggerRef} onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {visible && createPortal(
        <div
          ref={tooltipRef}
          style={{
            position: "fixed",
            zIndex: 9999,
            pointerEvents: "none",
            visibility: "hidden",
            ...pos,
          }}
        >
          <div className="px-2 py-1 text-xs text-neutral-200 bg-neutral-800 rounded shadow-lg max-w-xs break-all">
            {content}
          </div>
        </div>,
        document.body,
      )}
    </span>
  );
}
