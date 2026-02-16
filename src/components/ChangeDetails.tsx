import { useEffect, useRef } from "react";
import { type FileDiff } from "../lib/ipc";

interface ChangeDetailsProps {
  files: FileDiff[];
  totalInsertions: number;
  totalDeletions: number;
  onClose: () => void;
}

/**
 * Popup showing per-file breakdown of workspace changes.
 * Appears when user clicks the [+N -M] indicator.
 */
export function ChangeDetails({
  files,
  totalInsertions,
  totalDeletions,
  onClose,
}: ChangeDetailsProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  // Close on Escape.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (files.length === 0) {
    return (
      <div
        ref={ref}
        className="absolute top-full left-0 z-50 mt-1 rounded-md border border-theme-primary bg-theme-secondary p-4 shadow-xl"
      >
        <p className="text-sm text-theme-muted">No changes detected.</p>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 z-50 mt-1 w-80 max-h-72 overflow-y-auto rounded-md border border-theme-primary bg-theme-secondary shadow-xl"
    >
      {/* Header */}
      <div className="sticky top-0 flex items-center justify-between border-b border-theme-secondary bg-theme-secondary px-3 py-2">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-medium text-theme-secondary">Changes</span>
          <span className="font-mono text-green-500">+{totalInsertions}</span>
          <span className="font-mono text-red-500">-{totalDeletions}</span>
        </div>
        <span className="text-xs text-theme-muted">
          {files.length} file{files.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* File list */}
      <div className="p-2">
        {files.map((file) => (
          <div
            key={file.path}
            className="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-theme-tertiary"
          >
            <span
              className={`h-2 w-2 flex-shrink-0 rounded-full ${
                file.status === "added"
                  ? "bg-green-500"
                  : file.status === "deleted"
                    ? "bg-red-500"
                    : file.status === "renamed"
                      ? "bg-blue-500"
                      : "bg-yellow-500"
              }`}
            />
            <span className="flex-1 truncate font-mono text-theme-muted">
              {file.path}
            </span>
            {file.insertions > 0 && (
              <span className="font-mono text-green-500">
                +{file.insertions}
              </span>
            )}
            {file.deletions > 0 && (
              <span className="font-mono text-red-500">
                -{file.deletions}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
