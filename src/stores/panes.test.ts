import { describe, it, expect, beforeEach } from "vitest";
import { usePaneStore } from "./panes";

describe("panes store", () => {
  beforeEach(() => {
    // Reset store state before each test
    usePaneStore.setState({
      root: null,
      activePaneId: null,
      closedPanes: [],
    });
  });

  describe("initSinglePane", () => {
    it("creates a single leaf pane with the given session ID", () => {
      const store = usePaneStore.getState();
      const paneId = store.initSinglePane("session-123");

      const state = usePaneStore.getState();
      expect(state.root).not.toBeNull();
      expect(state.root?.type).toBe("leaf");
      expect(state.root?.id).toBe(paneId);
      expect((state.root as any).sessionId).toBe("session-123");
      expect(state.activePaneId).toBe(paneId);
    });
  });

  describe("splitPane", () => {
    it("returns null when root is null", () => {
      const store = usePaneStore.getState();
      const result = store.splitPane("horizontal", "new-session");
      expect(result).toBeNull();
    });

    it("returns null when activePaneId is null", () => {
      usePaneStore.setState({
        root: { type: "leaf", id: "pane-1", sessionId: "session-1" },
        activePaneId: null,
      });
      const store = usePaneStore.getState();
      const result = store.splitPane("horizontal", "new-session");
      expect(result).toBeNull();
    });

    it("splits the active pane horizontally", () => {
      const store = usePaneStore.getState();
      store.initSinglePane("session-1");

      const newPaneId = store.splitPane("horizontal", "session-2");

      const state = usePaneStore.getState();
      expect(newPaneId).not.toBeNull();
      expect(state.root?.type).toBe("split");
      expect((state.root as any).direction).toBe("horizontal");
      expect((state.root as any).children).toHaveLength(2);
      expect(state.activePaneId).toBe(newPaneId);
    });

    it("splits the active pane vertically", () => {
      const store = usePaneStore.getState();
      store.initSinglePane("session-1");

      const newPaneId = store.splitPane("vertical", "session-2");

      const state = usePaneStore.getState();
      expect(newPaneId).not.toBeNull();
      expect(state.root?.type).toBe("split");
      expect((state.root as any).direction).toBe("vertical");
    });

    it("creates nested splits correctly", () => {
      const store = usePaneStore.getState();
      store.initSinglePane("session-1");
      store.splitPane("horizontal", "session-2");
      store.splitPane("vertical", "session-3");

      const leaves = store.getLeaves();
      expect(leaves).toHaveLength(3);
    });
  });

  describe("getLeaves", () => {
    it("returns empty array when root is null", () => {
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

  describe("closePane", () => {
    it("does nothing when only one pane exists", () => {
      const store = usePaneStore.getState();
      const paneId = store.initSinglePane("session-1");

      store.closePane(paneId);

      const state = usePaneStore.getState();
      expect(state.root).not.toBeNull();
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
