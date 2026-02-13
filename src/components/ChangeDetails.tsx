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
        className="absolute top-full left-0 z-50 mt-1 rounded-md border border-gray-700/50 bg-[#0f1629] p-3 shadow-xl"
      >
        <p className="text-xs text-gray-500">No changes detected.</p>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 z-50 mt-1 w-72 max-h-64 overflow-y-auto rounded-md border border-gray-700/50 bg-[#0f1629] shadow-xl"
    >
      {/* Header */}
      <div className="sticky top-0 flex items-center justify-between border-b border-gray-700/30 bg-[#0f1629] px-3 py-1.5">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium text-gray-300">Changes</span>
          <span className="font-mono text-green-500">+{totalInsertions}</span>
          <span className="font-mono text-red-500">-{totalDeletions}</span>
        </div>
        <span className="text-[10px] text-gray-600">
          {files.length} file{files.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* File list */}
      <div className="p-1">
        {files.map((file) => (
          <div
            key={file.path}
            className="flex items-center gap-2 rounded px-2 py-0.5 text-[11px] hover:bg-gray-800/50"
          >
            <span
              className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                file.status === "added"
                  ? "bg-green-500"
                  : file.status === "deleted"
                    ? "bg-red-500"
                    : file.status === "renamed"
                      ? "bg-blue-500"
                      : "bg-yellow-500"
              }`}
            />
            <span className="flex-1 truncate font-mono text-gray-400">
              {file.path}
            </span>
            {file.insertions > 0 && (
              <span className="font-mono text-green-600">
                +{file.insertions}
              </span>
            )}
            {file.deletions > 0 && (
              <span className="font-mono text-red-600">
                -{file.deletions}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
