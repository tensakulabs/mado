import { useEffect, useState } from "react";
import { usePaneStore } from "../stores/panes";

interface LayoutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Full-screen modal for adjusting pane layout.
 * Shows a grid minimap, presets, and per-column/cell percentages.
 * Opens via Ctrl+B L or the grid icon in the toolbar.
 */
export function LayoutModal({ isOpen, onClose }: LayoutModalProps) {
  const columns = usePaneStore((s) => s.columns);
  const setColumnWidth = usePaneStore((s) => s.setColumnWidth);
  const setCellHeight = usePaneStore((s) => s.setCellHeight);
  const distributeEvenly = usePaneStore((s) => s.distributeEvenly);
  const setAllColumnWidths = usePaneStore((s) => s.setAllColumnWidths);

  // Close on Escape.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen || columns.length === 0) return null;

  const totalCells = columns.reduce((sum, col) => sum + col.cells.length, 0);
  const hasMultipleColumns = columns.length > 1;
  const hasMultipleCells = columns.some((col) => col.cells.length > 1);

  // ── Preset handlers ──

  const applyEven = () => {
    distributeEvenly();
  };

  const applyFocusLeft = () => {
    if (columns.length >= 2) {
      const rest = 30 / (columns.length - 1);
      setAllColumnWidths([70, ...Array(columns.length - 1).fill(rest)]);
    }
  };

  const applyFocusRight = () => {
    if (columns.length >= 2) {
      const rest = 30 / (columns.length - 1);
      setAllColumnWidths([...Array(columns.length - 1).fill(rest), 70]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 flex w-full max-w-lg flex-col overflow-hidden rounded-lg border border-theme-primary bg-theme-primary shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-theme-primary px-4 py-3">
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 text-theme-muted">
              <path fillRule="evenodd" d="M1 2.75A.75.75 0 0 1 1.75 2h3.5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-.75.75h-3.5A.75.75 0 0 1 1 6.25v-3.5Zm1.5.75v2h2v-2h-2ZM1 9.75A.75.75 0 0 1 1.75 9h3.5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-.75.75h-3.5a.75.75 0 0 1-.75-.75v-3.5Zm1.5.75v2h2v-2h-2ZM8 2.75A.75.75 0 0 1 8.75 2h3.5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-.75.75h-3.5A.75.75 0 0 1 8 6.25v-3.5Zm1.5.75v2h2v-2h-2ZM8 9.75A.75.75 0 0 1 8.75 9h3.5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-.75.75h-3.5a.75.75 0 0 1-.75-.75v-3.5Zm1.5.75v2h2v-2h-2Z" clipRule="evenodd" />
            </svg>
            <span className="text-sm font-medium text-theme-primary">Layout</span>
            <span className="text-xs text-theme-muted">
              {totalCells} pane{totalCells !== 1 ? "s" : ""} · {columns.length} column{columns.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-theme-muted">Ctrl+B L</span>
            <button
              onClick={onClose}
              className="rounded p-1 text-theme-muted hover:bg-theme-tertiary hover:text-theme-primary"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-4 py-3 space-y-4">
          {/* Grid minimap */}
          <div className="rounded border border-theme-primary bg-theme-secondary p-3">
            <p className="mb-2 text-xs font-medium text-theme-muted">Preview</p>
            <div className="flex h-32 w-full gap-px overflow-hidden rounded bg-theme-tertiary">
              {columns.map((col) => (
                <div
                  key={col.id}
                  className="flex flex-col gap-px"
                  style={{ width: `${col.width}%` }}
                >
                  {col.cells.map((cell, cellIdx) => (
                    <div
                      key={cell.id}
                      className="flex items-center justify-center border border-blue-500/30 bg-blue-900/20 rounded-sm"
                      style={{ height: `${col.cellHeights[cellIdx]}%` }}
                    >
                      <span className="text-[9px] text-blue-300/70 truncate px-1">
                        {cell.sessionId ? "pane" : "empty"}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Presets */}
          {hasMultipleColumns && (
            <div>
              <p className="mb-2 text-xs font-medium text-theme-muted">Presets</p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={applyEven}
                  className="flex flex-col items-center gap-1.5 rounded-md border border-theme-primary px-2 py-2 text-xs text-theme-muted transition-colors hover:border-blue-500/50 hover:bg-blue-900/20 hover:text-theme-primary"
                >
                  <EvenIcon />
                  <span>Even</span>
                </button>
                <button
                  onClick={applyFocusLeft}
                  className="flex flex-col items-center gap-1.5 rounded-md border border-theme-primary px-2 py-2 text-xs text-theme-muted transition-colors hover:border-blue-500/50 hover:bg-blue-900/20 hover:text-theme-primary"
                >
                  <FocusLeftIcon />
                  <span>Focus Left</span>
                </button>
                <button
                  onClick={applyFocusRight}
                  className="flex flex-col items-center gap-1.5 rounded-md border border-theme-primary px-2 py-2 text-xs text-theme-muted transition-colors hover:border-blue-500/50 hover:bg-blue-900/20 hover:text-theme-primary"
                >
                  <FocusRightIcon />
                  <span>Focus Right</span>
                </button>
              </div>
            </div>
          )}

          {/* Column widths — one editable % per column */}
          {hasMultipleColumns && (
            <div>
              <p className="mb-2 text-xs font-medium text-theme-muted">Columns</p>
              <div className="flex gap-2">
                {columns.map((col, i) => (
                  <PercentInput
                    key={col.id}
                    label={`Col ${i + 1}`}
                    value={Math.round(col.width)}
                    onChange={(v) => setColumnWidth(i, v)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Row heights — one editable % per row, grouped by column */}
          {hasMultipleCells && (
            <div>
              <p className="mb-2 text-xs font-medium text-theme-muted">Rows</p>
              <div className="space-y-2">
                {columns.map((col, ci) =>
                  col.cells.length > 1 ? (
                    <div key={col.id} className="flex gap-2">
                      {col.cells.length > 1 && columns.length > 1 && (
                        <span className="flex items-center text-[10px] text-theme-muted w-10 flex-shrink-0">Col {ci + 1}</span>
                      )}
                      {col.cells.map((cell, ri) => (
                        <PercentInput
                          key={cell.id}
                          label={`Row ${ri + 1}`}
                          value={Math.round(col.cellHeights[ri])}
                          onChange={(v) => setCellHeight(ci, ri, v)}
                        />
                      ))}
                    </div>
                  ) : null,
                )}
              </div>
            </div>
          )}

          {totalCells === 1 && (
            <p className="text-center text-xs text-theme-muted py-2">
              Single pane — split with Ctrl+B " or Ctrl+B % to use layout presets.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Editable percentage input ──

function PercentInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  // Sync draft when value changes externally (presets, drag resize).
  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const n = parseInt(draft, 10);
    if (!isNaN(n) && n !== value) {
      onChange(n);
    } else {
      setDraft(String(value));
    }
  };

  return (
    <div className="flex-1 rounded border border-theme-primary bg-theme-secondary px-3 py-2 text-center">
      <span className="text-xs text-theme-muted">{label}</span>
      {editing ? (
        <div className="flex items-center justify-center gap-0.5">
          <input
            type="number"
            min={5}
            max={95}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft(String(value));
                setEditing(false);
              }
            }}
            autoFocus
            className="w-12 bg-transparent text-center font-mono text-sm text-theme-primary outline-none border-b border-blue-500"
          />
          <span className="font-mono text-sm text-theme-muted">%</span>
        </div>
      ) : (
        <p
          className="cursor-pointer font-mono text-sm text-theme-primary hover:text-blue-400"
          onClick={() => setEditing(true)}
        >
          {value}%
        </p>
      )}
    </div>
  );
}

// ── Preset icons ──

function EvenIcon() {
  return (
    <div className="flex h-6 w-10 gap-px overflow-hidden rounded-sm">
      <div className="flex-1 bg-blue-500/40 rounded-l-sm" />
      <div className="flex-1 bg-blue-500/40 rounded-r-sm" />
    </div>
  );
}

function FocusLeftIcon() {
  return (
    <div className="flex h-6 w-10 gap-px overflow-hidden rounded-sm">
      <div className="bg-blue-500/50 rounded-l-sm" style={{ width: "70%" }} />
      <div className="flex-1 bg-blue-500/25 rounded-r-sm" />
    </div>
  );
}

function FocusRightIcon() {
  return (
    <div className="flex h-6 w-10 gap-px overflow-hidden rounded-sm">
      <div className="bg-blue-500/25 rounded-l-sm" style={{ width: "30%" }} />
      <div className="flex-1 bg-blue-500/50 rounded-r-sm" />
    </div>
  );
}
