import { useEffect, useState, useCallback, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { type Milestone, type DiffSummary } from "../lib/ipc";
import { useVersioning } from "../hooks/useVersioning";
import { Tooltip } from "./Tooltip";

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

  const containerRef = useRef<HTMLDivElement>(null);
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
    <div ref={containerRef} className="flex h-full flex-col bg-theme-secondary border-l border-theme-primary">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-theme-primary px-3 py-2">
        <h3 className="text-sm font-medium text-theme-secondary">Timeline</h3>
        <button
          onClick={onClose}
          className="rounded px-2 py-1 text-xs text-theme-muted hover:bg-theme-tertiary hover:text-theme-secondary"
        >
          Close
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-2 mt-2 rounded bg-red-900/30 px-3 py-2 text-sm text-red-300">
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
          <div className="py-4 text-center text-sm text-theme-muted">
            Loading milestones...
          </div>
        )}

        {!isLoading && milestones.length === 0 && (
          <div className="py-4 text-center text-sm text-theme-muted">
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

      {/* Diff panel — portal-based, opens to the left */}
      {selectedDiff && (
        <DiffPanel
          diff={selectedDiff.diff}
          onClose={() => setSelectedDiff(null)}
          anchorRef={containerRef}
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
    <div className="group rounded border border-theme-primary bg-theme-tertiary p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isLatest && (
              <span className="rounded bg-blue-900/50 px-1.5 py-0.5 text-xs font-medium text-blue-300">
                latest
              </span>
            )}
            <Tooltip content={milestone.message}>
              <span className="truncate text-sm text-theme-secondary block max-w-[10rem]">
                {milestone.message}
              </span>
            </Tooltip>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-theme-muted">
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
                <span className="text-green-500">
                  +{milestone.insertions}
                </span>{" "}
                <span className="text-red-500">-{milestone.deletions}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-2 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
        {onDiff && (
          <button
            onClick={onDiff}
            className="rounded px-2 py-1 text-xs text-theme-muted hover:bg-theme-secondary hover:text-theme-secondary"
          >
            diff
          </button>
        )}
        {!isLatest && !isRestoreConfirming && (
          <button
            onClick={onRestore}
            className="rounded px-2 py-1 text-xs text-theme-muted hover:bg-yellow-900/30 hover:text-yellow-300"
          >
            restore
          </button>
        )}
        {isRestoreConfirming && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-yellow-400">Restore?</span>
            <button
              onClick={onRestoreConfirm}
              className="rounded bg-yellow-600/30 px-2 py-1 text-xs text-yellow-300 hover:bg-yellow-600/50"
            >
              Yes
            </button>
            <button
              onClick={onRestoreCancel}
              className="rounded px-2 py-1 text-xs text-theme-muted hover:text-theme-secondary"
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
  anchorRef: React.RefObject<HTMLDivElement | null>;
}

function DiffPanel({ diff, onClose, anchorRef }: DiffPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<React.CSSProperties>({});

  useLayoutEffect(() => {
    if (!anchorRef.current || !panelRef.current) return;

    const anchor = anchorRef.current.getBoundingClientRect();
    const panel = panelRef.current.getBoundingClientRect();
    const GAP = 4;
    const MARGIN = 8;

    // Position to the LEFT of the timeline
    let left = anchor.left - panel.width - GAP;
    // Align bottom of panel with bottom of timeline
    let top = anchor.bottom - panel.height;

    // Clamp to viewport
    if (left < MARGIN) left = MARGIN;
    if (top < MARGIN) top = MARGIN;
    if (top + panel.height > window.innerHeight - MARGIN) {
      top = window.innerHeight - panel.height - MARGIN;
    }

    setPos({ top, left, visibility: "visible" });
  }, [anchorRef]);

  return createPortal(
    <>
      {/* Backdrop to close on outside click */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      {/* Floating panel */}
      <div
        ref={panelRef}
        className="fixed z-50 flex w-[400px] max-h-[50vh] flex-col rounded-lg border border-theme-primary bg-theme-secondary shadow-2xl"
        style={{ visibility: "hidden", ...pos }}
      >
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-theme-secondary px-3 py-2">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-medium text-theme-secondary">Diff</span>
            <span className="font-mono text-xs text-green-500">
              +{diff.total_insertions}
            </span>
            <span className="font-mono text-xs text-red-500">
              -{diff.total_deletions}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded px-2 py-1 text-xs text-theme-muted hover:bg-theme-tertiary hover:text-theme-secondary"
          >
            close
          </button>
        </div>
        {/* Scrollable file list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {diff.files.map((file) => (
            <div
              key={file.path}
              className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-theme-tertiary"
            >
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  file.status === "added"
                    ? "bg-green-500"
                    : file.status === "deleted"
                      ? "bg-red-500"
                      : file.status === "renamed"
                        ? "bg-blue-500"
                        : "bg-yellow-500"
                }`}
              />
              <Tooltip content={file.path}>
                <span className="flex-1 truncate font-mono text-theme-muted block min-w-0">
                  {file.path}
                </span>
              </Tooltip>
              <span className="font-mono text-green-500 flex-shrink-0">+{file.insertions}</span>
              <span className="font-mono text-red-500 flex-shrink-0">-{file.deletions}</span>
            </div>
          ))}
        </div>
      </div>
    </>,
    document.body,
  );
}
