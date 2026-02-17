import { describe, it, expect, beforeEach } from "vitest";
import { usePaneStore } from "./panes";

describe("panes store", () => {
  beforeEach(() => {
    usePaneStore.setState({
      columns: [],
      activePaneId: null,
      closedPanes: [],
    });
  });

  describe("initSinglePane", () => {
    it("creates a single pane with the given session ID", () => {
      const store = usePaneStore.getState();
      const paneId = store.initSinglePane("session-123");

      const state = usePaneStore.getState();
      expect(state.columns).toHaveLength(1);
      expect(state.columns[0].cells).toHaveLength(1);
      expect(state.columns[0].cells[0].id).toBe(paneId);
      expect(state.columns[0].cells[0].sessionId).toBe("session-123");
      expect(state.columns[0].width).toBe(100);
      expect(state.activePaneId).toBe(paneId);
    });
  });

  describe("splitPane", () => {
    it("returns null when columns are empty", () => {
      const store = usePaneStore.getState();
      const result = store.splitPane("horizontal", "new-session");
      expect(result).toBeNull();
    });

    it("returns null when activePaneId is null", () => {
      usePaneStore.setState({
        columns: [{
          id: "col-test",
          width: 100,
          cells: [{ id: "pane-1", sessionId: "session-1" }],
          cellHeights: [100],
        }],
        activePaneId: null,
      });
      const store = usePaneStore.getState();
      const result = store.splitPane("horizontal", "new-session");
      expect(result).toBeNull();
    });

    it("splits horizontally by adding a new column", () => {
      const store = usePaneStore.getState();
      store.initSinglePane("session-1");

      const newPaneId = store.splitPane("horizontal", "session-2");

      const state = usePaneStore.getState();
      expect(newPaneId).not.toBeNull();
      expect(state.columns).toHaveLength(2);
      expect(state.columns[0].width).toBe(50);
      expect(state.columns[1].width).toBe(50);
      expect(state.activePaneId).toBe(newPaneId);
    });

    it("splits vertically by adding a cell in the same column", () => {
      const store = usePaneStore.getState();
      store.initSinglePane("session-1");

      const newPaneId = store.splitPane("vertical", "session-2");

      const state = usePaneStore.getState();
      expect(newPaneId).not.toBeNull();
      expect(state.columns).toHaveLength(1);
      expect(state.columns[0].cells).toHaveLength(2);
      expect(state.columns[0].cellHeights[0]).toBe(50);
      expect(state.columns[0].cellHeights[1]).toBe(50);
    });

    it("creates correct layout with multiple splits", () => {
      const store = usePaneStore.getState();
      store.initSinglePane("session-1");
      store.splitPane("horizontal", "session-2");
      store.splitPane("horizontal", "session-3");

      const leaves = store.getLeaves();
      expect(leaves).toHaveLength(3);
    });

    it("distributes 3 columns evenly at ~33% each", () => {
      const store = usePaneStore.getState();
      store.initSinglePane("session-1");
      store.splitPane("horizontal", "session-2");
      store.splitPane("horizontal", "session-3");

      const state = usePaneStore.getState();
      expect(state.columns).toHaveLength(3);
      const widths = state.columns.map((c) => Math.round(c.width));
      expect(widths).toEqual([33, 33, 33]);
    });

    it("distributes 4 columns evenly at 25% each", () => {
      const store = usePaneStore.getState();
      store.initSinglePane("session-1");
      store.splitPane("horizontal", "session-2");
      store.splitPane("horizontal", "session-3");
      store.splitPane("horizontal", "session-4");

      const state = usePaneStore.getState();
      expect(state.columns).toHaveLength(4);
      expect(state.columns.every((c) => c.width === 25)).toBe(true);
    });
  });

  describe("getLeaves", () => {
    it("returns empty array when no columns", () => {
      const store = usePaneStore.getState();
      const leaves = store.getLeaves();
      expect(leaves).toEqual([]);
    });

    it("returns single leaf for single pane", () => {
      const store = usePaneStore.getState();
      store.initSinglePane("session-1");

      const leaves = store.getLeaves();
      expect(leaves).toHaveLength(1);
      expect(leaves[0].sessionId).toBe("session-1");
    });

    it("returns all leaves after splits", () => {
      const store = usePaneStore.getState();
      store.initSinglePane("session-1");
      store.splitPane("horizontal", "session-2");
      store.splitPane("horizontal", "session-3");

      const leaves = store.getLeaves();
      expect(leaves).toHaveLength(3);
      const sessionIds = leaves.map((l) => l.sessionId);
      expect(sessionIds).toContain("session-1");
      expect(sessionIds).toContain("session-2");
      expect(sessionIds).toContain("session-3");
    });
  });

  describe("distributeEvenly", () => {
    it("evens out 3 uneven columns to ~33% each", () => {
      const store = usePaneStore.getState();
      store.initSinglePane("session-1");
      store.splitPane("horizontal", "session-2");
      store.splitPane("horizontal", "session-3");
      // Make them uneven.
      store.setColumnWidth(0, 20);

      store.distributeEvenly();

      const state = usePaneStore.getState();
      const widths = state.columns.map((c) => Math.round(c.width));
      expect(widths).toEqual([33, 33, 33]);
    });

    it("evens out 4 uneven columns to 25% each", () => {
      const store = usePaneStore.getState();
      store.initSinglePane("session-1");
      store.splitPane("horizontal", "session-2");
      store.splitPane("horizontal", "session-3");
      store.splitPane("horizontal", "session-4");
      store.setColumnWidth(0, 60);

      store.distributeEvenly();

      const state = usePaneStore.getState();
      expect(state.columns.every((c) => c.width === 25)).toBe(true);
    });

    it("evens out cell heights within columns", () => {
      const store = usePaneStore.getState();
      store.initSinglePane("session-1");
      store.splitPane("vertical", "session-2");
      store.setCellHeight(0, 0, 80);

      store.distributeEvenly();

      const state = usePaneStore.getState();
      expect(state.columns[0].cellHeights).toEqual([50, 50]);
    });
  });

  describe("setColumnWidth", () => {
    it("sets one column and redistributes others proportionally", () => {
      const store = usePaneStore.getState();
      store.initSinglePane("session-1");
      store.splitPane("horizontal", "session-2");
      // Both start at 50/50.
      store.setColumnWidth(0, 70);

      const state = usePaneStore.getState();
      expect(Math.round(state.columns[0].width)).toBe(70);
      expect(Math.round(state.columns[1].width)).toBe(30);
    });

    it("redistributes 3 columns when one is changed", () => {
      const store = usePaneStore.getState();
      store.initSinglePane("session-1");
      store.splitPane("horizontal", "session-2");
      store.splitPane("horizontal", "session-3");
      // All start at ~33.33. Set first to 60.
      store.setColumnWidth(0, 60);

      const state = usePaneStore.getState();
      expect(Math.round(state.columns[0].width)).toBe(60);
      // Remaining 40% split evenly between two equal columns.
      expect(Math.round(state.columns[1].width)).toBe(20);
      expect(Math.round(state.columns[2].width)).toBe(20);
    });

    it("clamps minimum to 5%", () => {
      const store = usePaneStore.getState();
      store.initSinglePane("session-1");
      store.splitPane("horizontal", "session-2");

      store.setColumnWidth(0, 1);
      const state = usePaneStore.getState();
      expect(state.columns[0].width).toBe(5);
    });

    it("clamps maximum to 95%", () => {
      const store = usePaneStore.getState();
      store.initSinglePane("session-1");
      store.splitPane("horizontal", "session-2");

      store.setColumnWidth(0, 99);
      const state = usePaneStore.getState();
      expect(state.columns[0].width).toBe(95);
    });
  });

  describe("setCellHeight", () => {
    it("sets one cell height and redistributes others", () => {
      const store = usePaneStore.getState();
      store.initSinglePane("session-1");
      store.splitPane("vertical", "session-2");
      // Both at 50/50.
      store.setCellHeight(0, 0, 70);

      const state = usePaneStore.getState();
      expect(Math.round(state.columns[0].cellHeights[0])).toBe(70);
      expect(Math.round(state.columns[0].cellHeights[1])).toBe(30);
    });

    it("clamps minimum to 5%", () => {
      const store = usePaneStore.getState();
      store.initSinglePane("session-1");
      store.splitPane("vertical", "session-2");

      store.setCellHeight(0, 0, 2);
      const state = usePaneStore.getState();
      expect(state.columns[0].cellHeights[0]).toBe(5);
    });
  });

  describe("closePane", () => {
    it("does nothing when only one pane exists", () => {
      const store = usePaneStore.getState();
      const paneId = store.initSinglePane("session-1");

      store.closePane(paneId);

      const state = usePaneStore.getState();
      expect(state.columns).toHaveLength(1);
      expect(store.getLeaves()).toHaveLength(1);
    });

    it("removes a pane and adds to closedPanes", () => {
      const store = usePaneStore.getState();
      store.initSinglePane("session-1");
      const newPaneId = store.splitPane("horizontal", "session-2");

      store.closePane(newPaneId!);

      const state = usePaneStore.getState();
      expect(store.getLeaves()).toHaveLength(1);
      expect(state.closedPanes).toHaveLength(1);
    });
  });
});
