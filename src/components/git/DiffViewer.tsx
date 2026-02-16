import { useMemo } from "react";

interface DiffViewerProps {
  diff: string | null;
  fileName: string | null;
  isStaged: boolean;
  insertions?: number;
  deletions?: number;
  onStageHunk?: (hunkIndex: number) => void;
}

interface DiffLine {
  type: "addition" | "deletion" | "context" | "header" | "hunk-header";
  content: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
  hunkIndex?: number; // Set on hunk-header lines
}

/** Parse a unified diff string into structured lines. */
function parseDiff(raw: string): DiffLine[] {
  const lines = raw.split("\n");
  const result: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  let hunkIndex = -1;

  for (const line of lines) {
    // Diff header lines (---, +++, diff --git, index, etc.)
    if (
      line.startsWith("diff ") ||
      line.startsWith("index ") ||
      line.startsWith("--- ") ||
      line.startsWith("+++ ") ||
      line.startsWith("\\")
    ) {
      result.push({
        type: "header",
        content: line,
        oldLineNumber: null,
        newLineNumber: null,
      });
      continue;
    }

    // Hunk header: @@ -old,count +new,count @@
    if (line.startsWith("@@")) {
      hunkIndex++;
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
      }
      result.push({
        type: "hunk-header",
        content: line,
        oldLineNumber: null,
        newLineNumber: null,
        hunkIndex,
      });
      continue;
    }

    if (line.startsWith("+")) {
      result.push({
        type: "addition",
        content: line.slice(1),
        oldLineNumber: null,
        newLineNumber: newLine,
      });
      newLine++;
    } else if (line.startsWith("-")) {
      result.push({
        type: "deletion",
        content: line.slice(1),
        oldLineNumber: oldLine,
        newLineNumber: null,
      });
      oldLine++;
    } else {
      // Context line (starts with space or is empty).
      result.push({
        type: "context",
        content: line.startsWith(" ") ? line.slice(1) : line,
        oldLineNumber: oldLine,
        newLineNumber: newLine,
      });
      oldLine++;
      newLine++;
    }
  }

  return result;
}

/** Color classes for each line type. */
function lineClasses(type: DiffLine["type"]): string {
  switch (type) {
    case "addition":
      return "bg-green-900/20 text-green-300";
    case "deletion":
      return "bg-red-900/20 text-red-300";
    case "header":
      return "bg-blue-900/15 text-blue-400";
    case "hunk-header":
      return "bg-purple-900/15 text-purple-400";
    case "context":
    default:
      return "text-theme-secondary";
  }
}

/** Prefix gutter symbol for each line type. */
function linePrefix(type: DiffLine["type"]): string {
  switch (type) {
    case "addition":
      return "+";
    case "deletion":
      return "-";
    default:
      return " ";
  }
}

/**
 * Center panel of the GitView showing unified diff output.
 * Renders with line numbers, colored additions/deletions,
 * and monospace font. Supports staging individual hunks.
 */
export function DiffViewer({ diff, fileName, isStaged, insertions = 0, deletions = 0, onStageHunk }: DiffViewerProps) {
  const parsedLines = useMemo(() => (diff ? parseDiff(diff) : []), [diff]);

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
        <span className="text-xs font-mono text-theme-secondary">
          {fileName}
        </span>
        {(insertions > 0 || deletions > 0) && (
          <span className="text-xs font-mono text-theme-muted">
            [<span className="text-green-500">+{insertions}</span>{" "}
            <span className="text-red-500">-{deletions}</span>]
          </span>
        )}
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse font-mono text-xs leading-5">
          <tbody>
            {parsedLines.map((line, index) => (
              <tr
                key={index}
                className={`${lineClasses(line.type)} transition-colors hover:brightness-110`}
              >
                {/* Stage hunk button - only on hunk headers for unstaged files */}
                <td className="w-8 select-none border-r border-theme-secondary px-1 text-center">
                  {line.type === "hunk-header" && !isStaged && onStageHunk && (
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
                  {line.type === "header" || line.type === "hunk-header" ? "" : linePrefix(line.type)}
                </td>

                {/* Content */}
                <td className="whitespace-pre px-2">
                  {line.content}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
