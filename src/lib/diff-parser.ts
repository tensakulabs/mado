/**
 * Unified diff parser — shared utility for DiffViewer and DiffFullscreen.
 *
 * Parses standard unified diff format (git diff output) into structured
 * line objects with type, content, and dual line numbers.
 */

export interface DiffLine {
  type: "addition" | "deletion" | "context" | "header" | "hunk-header";
  content: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
  hunkIndex?: number;
}

/**
 * Detect whether a string looks like unified diff content.
 *
 * Checks for the presence of hunk headers (`@@`) and addition/deletion
 * markers (`+`/`-` lines). Returns true if content has at least one
 * hunk header AND at least one addition or deletion line.
 */
export function isDiffContent(content: string): boolean {
  if (!content || typeof content !== "string") return false;

  const lines = content.split("\n");
  let hasHunkHeader = false;
  let hasDiffLine = false;

  for (const line of lines) {
    if (line.startsWith("@@") && /@@ -\d+/.test(line)) {
      hasHunkHeader = true;
    }
    if (line.startsWith("+") && !line.startsWith("+++")) {
      hasDiffLine = true;
    }
    if (line.startsWith("-") && !line.startsWith("---")) {
      hasDiffLine = true;
    }
    if (hasHunkHeader && hasDiffLine) return true;
  }

  return hasHunkHeader && hasDiffLine;
}

/** Parse a unified diff string into structured lines. */
export function parseDiff(raw: string): DiffLine[] {
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
export function lineClasses(type: DiffLine["type"]): string {
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
export function linePrefix(type: DiffLine["type"]): string {
  switch (type) {
    case "addition":
      return "+";
    case "deletion":
      return "-";
    default:
      return " ";
  }
}
