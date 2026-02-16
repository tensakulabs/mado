import { useMemo, useState } from "react";
import { parseDiff, lineClasses, linePrefix } from "../../lib/diff-parser";
import type { DiffLine } from "../../lib/diff-parser";
import { DiffFullscreen } from "./DiffFullscreen";

// Re-export isDiffContent for consumers who need the detection helper.
export { isDiffContent } from "../../lib/diff-parser";

interface DiffViewerProps {
  diff: string | null;
  fileName: string | null;
  isStaged: boolean;
  insertions?: number;
  deletions?: number;
  onStageHunk?: (hunkIndex: number) => void;
}

/**
 * Center panel of the GitView showing unified diff output.
 * Renders with line numbers, colored additions/deletions,
 * and monospace font. Supports staging individual hunks
 * and expanding to a fullscreen modal.
 */
export function DiffViewer({
  diff,
  fileName,
  isStaged,
  insertions = 0,
  deletions = 0,
  onStageHunk,
}: DiffViewerProps) {
  const parsedLines = useMemo(() => (diff ? parseDiff(diff) : []), [diff]);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);

  if (!diff || !fileName) {
    return (
      <div className="flex h-full items-center justify-center bg-theme-secondary">
        <p className="text-sm text-theme-muted">
          Select a file to view its diff
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-theme-secondary">
      {/* File name header */}
      <div className="flex-shrink-0 border-b border-theme-primary bg-theme-primary px-4 py-2 flex items-center justify-between">
        <span className="text-xs font-mono text-theme-secondary truncate mr-2">
          {fileName}
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          {(insertions > 0 || deletions > 0) && (
            <span className="text-xs font-mono text-theme-muted">
              [<span className="text-green-500">+{insertions}</span>{" "}
              <span className="text-red-500">-{deletions}</span>]
            </span>
          )}
          {/* Expand to fullscreen */}
          <button
            onClick={() => setFullscreenOpen(true)}
            className="rounded p-1 text-theme-muted hover:bg-theme-tertiary hover:text-theme-primary transition-colors"
            title="View diff fullscreen"
            aria-label="Expand diff to fullscreen"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {/* Expand arrows icon */}
              <path d="M10 2h4v4M6 14H2v-4M14 2L9.5 6.5M2 14l4.5-4.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse font-mono text-xs leading-5">
          <tbody>
            {parsedLines.map((line: DiffLine, index: number) => (
              <tr
                key={index}
                className={`${lineClasses(line.type)} transition-colors hover:brightness-110`}
              >
                {/* Stage hunk button - only on hunk headers for unstaged files */}
                <td className="w-8 select-none border-r border-theme-secondary px-1 text-center">
                  {line.type === "hunk-header" &&
                    !isStaged &&
                    onStageHunk && (
                      <button
                        onClick={() => onStageHunk(line.hunkIndex!)}
                        className="rounded px-1 py-0.5 text-xs text-green-400 hover:bg-green-900/30"
                        title="Stage this hunk"
                      >
                        +
                      </button>
                    )}
                </td>

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
      </div>

      {/* Fullscreen modal */}
      <DiffFullscreen
        open={fullscreenOpen}
        onOpenChange={setFullscreenOpen}
        diff={diff}
        fileName={fileName}
        insertions={insertions}
        deletions={deletions}
      />
    </div>
  );
}
