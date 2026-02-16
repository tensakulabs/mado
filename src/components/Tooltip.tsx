import { ReactNode } from "react";

interface TooltipProps {
  content: string;
  children: ReactNode;
  position?: "top" | "right";
}

/**
 * Simple tooltip that appears on hover.
 * Positioned above by default, or to the right when specified.
 */
export function Tooltip({ content, children, position = "top" }: TooltipProps) {
  if (position === "right") {
    return (
      <span className="relative group/tooltip">
        {children}
        <span className="absolute left-full top-1/2 -translate-y-1/2 ml-1 flex items-center opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-opacity pointer-events-none z-50">
          <span className="border-y-[6px] border-y-transparent border-r-[6px] border-r-neutral-800" />
          <span className="px-2 py-1 text-xs text-neutral-200 bg-neutral-800 rounded shadow-lg whitespace-nowrap">
            {content}
          </span>
        </span>
      </span>
    );
  }

  // Default: top position
  return (
    <span className="relative group/tooltip">
      {children}
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 flex flex-col items-center opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-opacity pointer-events-none z-50">
        <span className="px-2 py-1 text-xs text-neutral-200 bg-neutral-800 rounded shadow-lg whitespace-nowrap">
          {content}
        </span>
        <span className="border-x-[6px] border-x-transparent border-t-[6px] border-t-neutral-800" />
      </span>
    </span>
  );
}
