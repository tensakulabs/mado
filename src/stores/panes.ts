import { create } from "zustand";

// ── Types ──

export type SplitDirection = "horizontal" | "vertical";

export interface PaneCell {
  id: string;
  sessionId?: string;
}

export interface PaneColumn {
  id: string;
  width: number; // percentage (0-100), all columns sum to ~100
  cells: PaneCell[];
  cellHeights: number[]; // percentage per cell, same length as cells, sum to ~100
}

interface ClosedPane {
  cell: PaneCell;
  columnIndex: number;
  cellIndex: number;
  closedAt: number;
}

interface PaneState {
  columns: PaneColumn[];
  activePaneId: string | null;
  closedPanes: ClosedPane[];
}

interface PaneActions {
  initSinglePane: (sessionId?: string) => string;
  splitPane: (direction: SplitDirection, newSessionId: string) => string | null;
  closePane: (id: string) => void;
  undoClose: () => ClosedPane | null;
  focusPane: (id: string) => void;
  resizeColumns: (leftIndex: number, ratio: number) => void;
  resizeCells: (colIndex: number, topIndex: number, ratio: number) => void;
  setColumnWidth: (colIndex: number, newWidth: number) => void;
  setCellHeight: (colIndex: number, cellIndex: number, newHeight: number) => void;
  distributeEvenly: () => void;
  setAllColumnWidths: (widths: number[]) => void;
  getLeaves: () => PaneCell[];
  navigateFocus: (dir: "left" | "right" | "up" | "down") => void;
  replaceSession: (paneId: string, newSessionId: string) => void;
}

let nextPaneId = 1;
function generatePaneId(): string {
  return `pane-${nextPaneId++}`;
}

let nextColId = 1;
function generateColId(): string {
  return `col-${nextColId++}`;
}

// ── Helpers ──

function findCell(
  columns: PaneColumn[],
  cellId: string,
): { colIndex: number; cellIndex: number } | null {
  for (let ci = 0; ci < columns.length; ci++) {
    for (let ri = 0; ri < columns[ci].cells.length; ri++) {
      if (columns[ci].cells[ri].id === cellId) {
        return { colIndex: ci, cellIndex: ri };
      }
    }
  }
  return null;
}

function allCells(columns: PaneColumn[]): PaneCell[] {
  return columns.flatMap((c) => c.cells);
}

function cloneColumns(columns: PaneColumn[]): PaneColumn[] {
  return columns.map((c) => ({
    ...c,
    cells: [...c.cells],
    cellHeights: [...c.cellHeights],
  }));
}

// ── Store ──

export const usePaneStore = create<PaneState & PaneActions>()((set, get) => ({
  columns: [],
  activePaneId: null,
  closedPanes: [],

  initSinglePane: (sessionId?: string) => {
    const id = generatePaneId();
    set({
      columns: [
        {
          id: generateColId(),
          width: 100,
          cells: [{ id, sessionId }],
          cellHeights: [100],
        },
      ],
      activePaneId: id,
    });
    return id;
  },

  splitPane: (direction: SplitDirection, newSessionId: string) => {
    const { columns, activePaneId } = get();
    if (columns.length === 0 || !activePaneId) return null;

    const pos = findCell(columns, activePaneId);
    if (!pos) return null;

    const newPaneId = generatePaneId();
    const newCell: PaneCell = { id: newPaneId, sessionId: newSessionId };
    const newColumns = cloneColumns(columns);

    if (direction === "horizontal") {
      // Add new column after current column, redistribute widths evenly.
      newColumns.splice(pos.colIndex + 1, 0, {
        id: generateColId(),
        width: 0,
        cells: [newCell],
        cellHeights: [100],
      });
      const w = 100 / newColumns.length;
      for (const col of newColumns) col.width = w;
    } else {
      // Add new cell below current cell in same column, redistribute heights evenly.
      const col = newColumns[pos.colIndex];
      col.cells.splice(pos.cellIndex + 1, 0, newCell);
      const h = 100 / col.cells.length;
      col.cellHeights = col.cells.map(() => h);
    }

    set({ columns: newColumns, activePaneId: newPaneId });
    return newPaneId;
  },

  closePane: (id: string) => {
    const { columns, activePaneId, closedPanes } = get();
    const cells = allCells(columns);
    if (cells.length <= 1) return; // Can't close the last pane.

    const pos = findCell(columns, id);
    if (!pos) return;

    const closedCell = columns[pos.colIndex].cells[pos.cellIndex];
    const newColumns = cloneColumns(columns);
    const targetCol = newColumns[pos.colIndex];

    if (targetCol.cells.length === 1) {
      // Remove entire column, redistribute widths.
      newColumns.splice(pos.colIndex, 1);
      const w = 100 / newColumns.length;
      for (const c of newColumns) c.width = w;
    } else {
      // Remove cell from column, redistribute heights.
      targetCol.cells.splice(pos.cellIndex, 1);
      const h = 100 / targetCol.cells.length;
      targetCol.cellHeights = targetCol.cells.map(() => h);
    }

    // Determine new active pane.
    let newActiveId = activePaneId;
    if (activePaneId === id) {
      const adjColIdx = Math.min(pos.colIndex, newColumns.length - 1);
      const adjCol = newColumns[adjColIdx];
      const adjCellIdx = Math.min(pos.cellIndex, adjCol.cells.length - 1);
      newActiveId = adjCol.cells[adjCellIdx].id;
    }

    const closedPane: ClosedPane = {
      cell: closedCell,
      columnIndex: pos.colIndex,
      cellIndex: pos.cellIndex,
      closedAt: Date.now(),
    };

    set({
      columns: newColumns,
      activePaneId: newActiveId,
      closedPanes: [closedPane, ...closedPanes].slice(0, 5),
    });

    // Auto-expire after 8 seconds.
    setTimeout(() => {
      set((state) => ({
        closedPanes: state.closedPanes.filter((p) => p !== closedPane),
      }));
    }, 8000);
  },

  undoClose: () => {
    const { closedPanes, columns, activePaneId } = get();
    if (closedPanes.length === 0) return null;

    const [restored, ...remaining] = closedPanes;
    const newColumns = cloneColumns(columns);

    // Add cell back to active pane's column (or create new column).
    const activePos = activePaneId
      ? findCell(newColumns, activePaneId)
      : null;

    if (activePos) {
      const col = newColumns[activePos.colIndex];
      col.cells.splice(activePos.cellIndex + 1, 0, restored.cell);
      const h = 100 / col.cells.length;
      col.cellHeights = col.cells.map(() => h);
    } else {
      newColumns.push({
        id: generateColId(),
        width: 0,
        cells: [restored.cell],
        cellHeights: [100],
      });
      const w = 100 / newColumns.length;
      for (const c of newColumns) c.width = w;
    }

    set({
      columns: newColumns,
      activePaneId: restored.cell.id,
      closedPanes: remaining,
    });

    return restored;
  },

  focusPane: (id: string) => {
    set({ activePaneId: id });
  },

  resizeColumns: (leftIndex: number, ratio: number) => {
    const { columns } = get();
    if (leftIndex < 0 || leftIndex >= columns.length - 1) return;

    const combined = columns[leftIndex].width + columns[leftIndex + 1].width;
    const newLeft = Math.max(5, Math.min(combined - 5, combined * ratio));
    const newRight = combined - newLeft;

    const newColumns = columns.map((c, i) => {
      if (i === leftIndex) return { ...c, width: newLeft };
      if (i === leftIndex + 1) return { ...c, width: newRight };
      return c;
    });

    set({ columns: newColumns });
  },

  resizeCells: (colIndex: number, topIndex: number, ratio: number) => {
    const { columns } = get();
    if (colIndex < 0 || colIndex >= columns.length) return;
    const col = columns[colIndex];
    if (topIndex < 0 || topIndex >= col.cells.length - 1) return;

    const combined = col.cellHeights[topIndex] + col.cellHeights[topIndex + 1];
    const newTop = Math.max(5, Math.min(combined - 5, combined * ratio));
    const newBottom = combined - newTop;

    const newColumns = columns.map((c, ci) => {
      if (ci !== colIndex) return c;
      const newHeights = [...c.cellHeights];
      newHeights[topIndex] = newTop;
      newHeights[topIndex + 1] = newBottom;
      return { ...c, cellHeights: newHeights };
    });

    set({ columns: newColumns });
  },

  setColumnWidth: (colIndex: number, newWidth: number) => {
    const { columns } = get();
    if (columns.length < 2 || colIndex < 0 || colIndex >= columns.length) return;

    const clamped = Math.max(5, Math.min(95, newWidth));
    const oldWidth = columns[colIndex].width;
    const remaining = 100 - oldWidth; // what others currently share
    const newRemaining = 100 - clamped;

    const newColumns = columns.map((c, i) => {
      if (i === colIndex) return { ...c, width: clamped };
      // Redistribute proportionally among other columns.
      const share = remaining > 0 ? c.width / remaining : 1 / (columns.length - 1);
      return { ...c, width: Math.max(5, share * newRemaining) };
    });

    set({ columns: newColumns });
  },

  setCellHeight: (colIndex: number, cellIndex: number, newHeight: number) => {
    const { columns } = get();
    if (colIndex < 0 || colIndex >= columns.length) return;
    const col = columns[colIndex];
    if (col.cells.length < 2 || cellIndex < 0 || cellIndex >= col.cells.length) return;

    const clamped = Math.max(5, Math.min(95, newHeight));
    const oldHeight = col.cellHeights[cellIndex];
    const remaining = 100 - oldHeight;
    const newRemaining = 100 - clamped;

    const newColumns = columns.map((c, ci) => {
      if (ci !== colIndex) return c;
      const newHeights = c.cellHeights.map((h, ri) => {
        if (ri === cellIndex) return clamped;
        const share = remaining > 0 ? h / remaining : 1 / (col.cells.length - 1);
        return Math.max(5, share * newRemaining);
      });
      return { ...c, cellHeights: newHeights };
    });

    set({ columns: newColumns });
  },

  distributeEvenly: () => {
    const { columns } = get();
    if (columns.length === 0) return;

    const evenWidth = 100 / columns.length;
    const newColumns = columns.map((c) => {
      const evenHeight = 100 / c.cells.length;
      return {
        ...c,
        width: evenWidth,
        cellHeights: c.cells.map(() => evenHeight),
      };
    });

    set({ columns: newColumns });
  },

  setAllColumnWidths: (widths: number[]) => {
    const { columns } = get();
    if (widths.length !== columns.length) return;

    const newColumns = columns.map((c, i) => ({
      ...c,
      width: widths[i],
    }));

    set({ columns: newColumns });
  },

  getLeaves: () => {
    return allCells(get().columns);
  },

  navigateFocus: (dir: "left" | "right" | "up" | "down") => {
    const { columns, activePaneId } = get();
    if (columns.length === 0 || !activePaneId) return;

    const pos = findCell(columns, activePaneId);
    if (!pos) return;

    let newCol = pos.colIndex;
    let newCell = pos.cellIndex;

    switch (dir) {
      case "left":
        newCol = (newCol - 1 + columns.length) % columns.length;
        newCell = Math.min(newCell, columns[newCol].cells.length - 1);
        break;
      case "right":
        newCol = (newCol + 1) % columns.length;
        newCell = Math.min(newCell, columns[newCol].cells.length - 1);
        break;
      case "up":
        if (columns[newCol].cells.length > 1) {
          newCell =
            (newCell - 1 + columns[newCol].cells.length) %
            columns[newCol].cells.length;
        }
        break;
      case "down":
        if (columns[newCol].cells.length > 1) {
          newCell = (newCell + 1) % columns[newCol].cells.length;
        }
        break;
    }

    set({ activePaneId: columns[newCol].cells[newCell].id });
  },

  replaceSession: (paneId: string, newSessionId: string) => {
    const { columns } = get();
    const newColumns = columns.map((col) => ({
      ...col,
      cells: col.cells.map((cell) =>
        cell.id === paneId ? { ...cell, sessionId: newSessionId } : cell,
      ),
    }));
    set({ columns: newColumns });
  },
}));
