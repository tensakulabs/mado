import { useEffect, useState, useCallback } from "react";
import { type Milestone, type DiffSummary } from "../lib/ipc";
import { useVersioning } from "../hooks/useVersioning";

interface TimelineProps {
  sessionId: string;
  onClose: () => void;
}

/**
 * Timeline panel showing milestones for a session.
 * Supports viewing diffs and restoring to previous milestones.
 */
export function Timeline({ sessionId, onClose }: TimelineProps) {
  const {
    milestones,
    isLoading,
    error,
    fetchMilestones,
    getDiff,
    restore,
    clearError,
  } = useVersioning();

  const [selectedDiff, setSelectedDiff] = useState<{
    fromOid: string;
    toOid: string;
    diff: DiffSummary;
  } | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState<string | null>(null);

  useEffect(() => {
    fetchMilestones(sessionId, 20);
  }, [sessionId, fetchMilestones]);

  const handleDiff = useCallback(
    async (fromOid: string, toOid: string) => {
      const diff = await getDiff(sessionId, fromOid, toOid);
      if (diff) {
        setSelectedDiff({ fromOid, toOid, diff });
      }
    },
    [sessionId, getDiff],
  );

  const handleRestore = useCallback(
    async (oid: string) => {
      const success = await restore(sessionId, oid);
      if (success) {
        setRestoreConfirm(null);
        // Refresh milestones after restore.
        await fetchMilestones(sessionId, 20);
      }
    },
    [sessionId, restore, fetchMilestones],
  );

  const formatTimestamp = (ts: string) => {
    try {
      const date = new Date(ts);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);

      if (minutes < 1) return "just now";
      if (minutes < 60) return `${minutes}m ago`;
      if (hours < 24) return `${hours}h ago`;
      return date.toLocaleDateString();
    } catch {
      return ts;
    }
  };

  return (
    <div className="flex h-full flex-col bg-[#0f1629] border-l border-gray-700/50">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-700/50 px-3 py-2">
        <h3 className="text-sm font-medium text-gray-300">Timeline</h3>
        <button
          onClick={onClose}
          className="rounded px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-800 hover:text-gray-300"
        >
          Close
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-2 mt-2 rounded bg-red-900/30 px-2 py-1 text-xs text-red-300">
          {error}
          <button
            onClick={clearError}
            className="ml-2 text-red-500 hover:text-red-300"
          >
            dismiss
          </button>
        </div>
      )}

      {/* Milestones list */}
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading && milestones.length === 0 && (
          <div className="py-4 text-center text-xs text-gray-500">
            Loading milestones...
          </div>
        )}

        {!isLoading && milestones.length === 0 && (
          <div className="py-4 text-center text-xs text-gray-500">
            No milestones yet. Use the save button to create one.
          </div>
        )}

        <div className="space-y-1">
          {milestones.map((milestone, index) => (
            <MilestoneEntry
              key={milestone.oid}
              milestone={milestone}
              isLatest={index === 0}
              formatTimestamp={formatTimestamp}
              onDiff={
                index < milestones.length - 1
                  ? () =>
                      handleDiff(milestones[index + 1].oid, milestone.oid)
                  : undefined
              }
              onRestore={() => setRestoreConfirm(milestone.oid)}
              isRestoreConfirming={restoreConfirm === milestone.oid}
              onRestoreConfirm={() => handleRestore(milestone.oid)}
              onRestoreCancel={() => setRestoreConfirm(null)}
            />
          ))}
        </div>
      </div>

      {/* Diff panel */}
      {selectedDiff && (
        <DiffPanel
          diff={selectedDiff.diff}
          onClose={() => setSelectedDiff(null)}
        />
      )}
    </div>
  );
}

// ── Sub-components ──

interface MilestoneEntryProps {
  milestone: Milestone;
  isLatest: boolean;
  formatTimestamp: (ts: string) => string;
  onDiff?: () => void;
  onRestore: () => void;
  isRestoreConfirming: boolean;
  onRestoreConfirm: () => void;
  onRestoreCancel: () => void;
}

function MilestoneEntry({
  milestone,
  isLatest,
  formatTimestamp,
  onDiff,
  onRestore,
  isRestoreConfirming,
  onRestoreConfirm,
  onRestoreCancel,
}: MilestoneEntryProps) {
  return (
    <div className="group rounded border border-gray-700/30 bg-gray-900/30 p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {isLatest && (
              <span className="rounded bg-blue-900/50 px-1 py-0.5 text-[10px] font-medium text-blue-300">
                latest
              </span>
            )}
            <span className="truncate text-xs text-gray-300">
              {milestone.message}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-gray-600">
            <span className="font-mono">{milestone.oid.slice(0, 7)}</span>
            <span>{formatTimestamp(milestone.timestamp)}</span>
            {milestone.files_changed > 0 && (
              <span>
                {milestone.files_changed} file
                {milestone.files_changed > 1 ? "s" : ""}
              </span>
            )}
            {(milestone.insertions > 0 || milestone.deletions > 0) && (
              <span className="font-mono">
                <span className="text-green-600">
                  +{milestone.insertions}
                </span>{" "}
                <span className="text-red-600">-{milestone.deletions}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-1 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {onDiff && (
          <button
            onClick={onDiff}
            className="rounded px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-gray-800 hover:text-gray-300"
          >
            diff
          </button>
        )}
        {!isLatest && !isRestoreConfirming && (
          <button
            onClick={onRestore}
            className="rounded px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-yellow-900/30 hover:text-yellow-300"
          >
            restore
          </button>
        )}
        {isRestoreConfirming && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-yellow-400">Restore?</span>
            <button
              onClick={onRestoreConfirm}
              className="rounded bg-yellow-600/30 px-1.5 py-0.5 text-[10px] text-yellow-300 hover:bg-yellow-600/50"
            >
              Yes
            </button>
            <button
              onClick={onRestoreCancel}
              className="rounded px-1.5 py-0.5 text-[10px] text-gray-500 hover:text-gray-300"
            >
              No
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface DiffPanelProps {
  diff: DiffSummary;
  onClose: () => void;
}

function DiffPanel({ diff, onClose }: DiffPanelProps) {
  return (
    <div className="max-h-[40%] border-t border-gray-700/50 overflow-y-auto">
      <div className="flex items-center justify-between border-b border-gray-700/30 px-3 py-1.5">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium text-gray-300">Diff</span>
          <span className="font-mono text-[10px] text-green-500">
            +{diff.total_insertions}
          </span>
          <span className="font-mono text-[10px] text-red-500">
            -{diff.total_deletions}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-xs text-gray-500 hover:text-gray-300"
        >
          close
        </button>
      </div>
      <div className="p-2 space-y-0.5">
        {diff.files.map((file) => (
          <div
            key={file.path}
            className="flex items-center gap-2 rounded px-2 py-0.5 text-[11px] hover:bg-gray-800/50"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
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
            <span className="font-mono text-green-600">+{file.insertions}</span>
            <span className="font-mono text-red-600">-{file.deletions}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
