import { useRef, useState, useCallback, type CSSProperties } from "react";
import { Tooltip } from "../Tooltip";

interface TruncatedTextProps {
  /** The text content to display (and show in tooltip when truncated). */
  children: string;
  /** Additional CSS class names for the outer span. */
  className?: string;
  /** Inline styles merged onto the outer span. */
  style?: CSSProperties;
  /** Tooltip position when text is truncated. */
  tooltipPosition?: "top" | "right";
}

/**
 * Renders text with CSS text-overflow: ellipsis.
 * When the text IS truncated (scrollWidth > clientWidth), hovering
 * shows a Tooltip with the full text.  When text fits, no tooltip appears.
 */
export function TruncatedText({
  children,
  className = "",
  style,
  tooltipPosition = "top",
}: TruncatedTextProps) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  const checkTruncation = useCallback(() => {
    const el = spanRef.current;
    if (el) {
      setIsTruncated(el.scrollWidth > el.clientWidth);
    }
  }, []);

  const inner = (
    <span
      ref={spanRef}
      onMouseEnter={checkTruncation}
      className={`block overflow-hidden text-ellipsis whitespace-nowrap ${className}`}
      style={style}
    >
      {children}
    </span>
  );

  if (isTruncated) {
    return (
      <Tooltip content={children} position={tooltipPosition}>
        {inner}
      </Tooltip>
    );
  }

  return inner;
}
