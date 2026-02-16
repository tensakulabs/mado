import { useMemo, useRef, useCallback, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { parseDiff, lineClasses, linePrefix } from "../../lib/diff-parser";
import type { DiffLine } from "../../lib/diff-parser";

interface DiffFullscreenProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  diff: string;
  fileName: string;
  insertions?: number;
  deletions?: number;
}

/**
 * Truncating file path with tooltip.
 * Shows a native title tooltip only when the text is actually truncated.
 */
function TruncatedPath({ path }: { path: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  const checkTruncation = useCallback(() => {
    const el = ref.current;
    if (el) {
      setIsTruncated(el.scrollWidth > el.clientWidth);
    }
  }, []);

  useEffect(() => {
    checkTruncation();
    window.addEventListener("resize", checkTruncation);
    return () => window.removeEventListener("resize", checkTruncation);
  }, [checkTruncation, path]);

  return (
    <span
      ref={ref}
      className="truncate max-w-[60vw] inline-block align-bottom"
      title={isTruncated ? path : undefined}
    >
      {path}
    </span>
  );
}

/**
 * Renders parsed diff lines as a table — shared between inline and fullscreen views.
 */
function DiffTable({ lines }: { lines: DiffLine[] }) {
  return (
    <table className="w-full border-collapse font-mono text-xs leading-5">
      <tbody>
        {lines.map((line, index) => (
          <tr
            key={index}
            className={`${lineClasses(line.type)} transition-colors hover:brightness-110`}
          >
            {/* Old line number gutter */}
            <td className="w-12 select-none border-r border-theme-secondary px-2 text-right text-theme-muted">
              {line.oldLineNumber ?? ""}
            </td>

            {/* New line number gutter */}
            <td className="w-12 select-none border-r border-theme-secondary px-2 text-right text-theme-muted">
              {line.newLineNumber ?? ""}
            </td>

            {/* Prefix (+/-/space) */}
            <td className="w-4 select-none px-1 text-center">
              {line.type === "header" || line.type === "hunk-header"
                ? ""
                : linePrefix(line.type)}
            </td>

            {/* Content */}
            <td className="whitespace-pre px-2">{line.content}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Fullscreen diff modal using Radix Dialog.
 * Shows the same color-coded diff rendering in a viewport-filling overlay.
 * Close with Escape or the X button.
 */
export function DiffFullscreen({
  open,
  onOpenChange,
  diff,
  fileName,
  insertions = 0,
  deletions = 0,
}: DiffFullscreenProps) {
  const parsedLines = useMemo(() => parseDiff(diff), [diff]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content className="fixed inset-2 z-50 flex flex-col overflow-hidden rounded-lg border border-theme-primary bg-theme-secondary shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
          {/* Header bar */}
          <div className="flex flex-shrink-0 items-center justify-between border-b border-theme-primary bg-theme-primary px-4 py-2">
            <div className="flex items-center gap-3 min-w-0 flex-1 mr-4">
              <Dialog.Title className="text-sm font-mono text-theme-primary min-w-0">
                <TruncatedPath path={fileName} />
              </Dialog.Title>
              {(insertions > 0 || deletions > 0) && (
                <span className="text-xs font-mono text-theme-muted flex-shrink-0">
                  [<span className="text-green-500">+{insertions}</span>{" "}
                  <span className="text-red-500">-{deletions}</span>]
                </span>
              )}
            </div>
            <Dialog.Close asChild>
              <button
                className="flex-shrink-0 rounded p-1 text-theme-muted hover:bg-theme-tertiary hover:text-theme-primary transition-colors"
                aria-label="Close fullscreen diff"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </Dialog.Close>
          </div>

          {/* Scrollable diff body */}
          <div className="flex-1 overflow-auto">
            <DiffTable lines={parsedLines} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
