import { useCallback, useRef } from "react";
import { usePaneStore } from "../stores/panes";
import { Pane } from "./Pane";

/**
 * Renders panes as a flat column/cell grid with draggable resize handles.
 * Columns are laid out horizontally, cells within each column vertically.
 */
export function Layout() {
  const columns = usePaneStore((s) => s.columns);

  if (columns.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-theme-secondary">
        <p className="text-sm text-theme-muted">No panes</p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full overflow-hidden flex-row">
      {columns.map((col, colIdx) => (
        <ColumnWithHandle key={col.id} colIndex={colIdx} />
      ))}
    </div>
  );
}

/**
 * Renders a single column (with its cells) and optionally a resize handle
 * on its right edge (between this column and the next).
 */
function ColumnWithHandle({ colIndex }: { colIndex: number }) {
  const columns = usePaneStore((s) => s.columns);
  const resizeColumns = usePaneStore((s) => s.resizeColumns);
  const col = columns[colIndex];
  const isLastColumn = colIndex === columns.length - 1;
  const containerRef = useRef<HTMLDivElement>(null);

  const handleColumnResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const parent = containerRef.current?.parentElement;
      if (!parent) return;

      const rect = parent.getBoundingClientRect();
      const totalWidth = rect.width;
      const offsetLeft = rect.left;

      // Sum of widths up to (but not including) colIndex.
      let leftOffset = 0;
      for (let i = 0; i < colIndex; i++) {
        leftOffset += columns[i].width;
      }
      const combinedWidth = columns[colIndex].width + columns[colIndex + 1].width;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const pos = moveEvent.clientX;
        const pctFromLeft = ((pos - offsetLeft) / totalWidth) * 100;
        const ratio = Math.max(0.05, Math.min(0.95, (pctFromLeft - leftOffset) / combinedWidth));
        resizeColumns(colIndex, ratio);
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [colIndex, columns, resizeColumns],
  );

  return (
    <>
      <div
        ref={containerRef}
        className="flex min-w-0 flex-col"
        style={{
          flex: `${col.width} 1 0`,
          overflow: "hidden",
        }}
      >
        {col.cells.map((cell, cellIdx) => (
          <CellWithHandle
            key={cell.id}
            colIndex={colIndex}
            cellIndex={cellIdx}
          />
        ))}
      </div>
      {/* Column resize handle (not on last column) */}
      {!isLastColumn && (
        <div
          className="w-1 flex-shrink-0 cursor-col-resize bg-theme-tertiary transition-colors hover:bg-blue-500/40"
          onMouseDown={handleColumnResize}
        />
      )}
    </>
  );
}

/**
 * Renders a single cell (pane) and optionally a resize handle below it
 * (between this cell and the next in the same column).
 */
function CellWithHandle({
  colIndex,
  cellIndex,
}: {
  colIndex: number;
  cellIndex: number;
}) {
  const columns = usePaneStore((s) => s.columns);
  const resizeCells = usePaneStore((s) => s.resizeCells);
  const col = columns[colIndex];
  const cell = col.cells[cellIndex];
  const height = col.cellHeights[cellIndex];
  const isLastCell = cellIndex === col.cells.length - 1;
  const containerRef = useRef<HTMLDivElement>(null);

  const handleCellResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const colEl = containerRef.current?.parentElement;
      if (!colEl) return;

      const rect = colEl.getBoundingClientRect();
      const totalHeight = rect.height;
      const offsetTop = rect.top;

      // Sum of heights above this cell.
      let topOffset = 0;
      for (let i = 0; i < cellIndex; i++) {
        topOffset += col.cellHeights[i];
      }
      const combinedHeight = col.cellHeights[cellIndex] + col.cellHeights[cellIndex + 1];

      const onMouseMove = (moveEvent: MouseEvent) => {
        const pos = moveEvent.clientY;
        const pctFromTop = ((pos - offsetTop) / totalHeight) * 100;
        const ratio = Math.max(0.05, Math.min(0.95, (pctFromTop - topOffset) / combinedHeight));
        resizeCells(colIndex, cellIndex, ratio);
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
    },
    [colIndex, cellIndex, col.cellHeights, resizeCells],
  );

  return (
    <>
      <div
        ref={containerRef}
        className="min-h-0 min-w-0"
        style={{
          flex: `${height} 1 0`,
          overflow: "hidden",
        }}
      >
        <Pane paneId={cell.id} sessionId={cell.sessionId} />
      </div>
      {/* Cell resize handle (not on last cell in column) */}
      {!isLastCell && (
        <div
          className="h-1 flex-shrink-0 cursor-row-resize bg-theme-tertiary transition-colors hover:bg-blue-500/40"
          onMouseDown={handleCellResize}
        />
      )}
    </>
  );
}
