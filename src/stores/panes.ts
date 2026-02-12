import { create } from "zustand";

// ── Types ──

export type SplitDirection = "horizontal" | "vertical";

export interface LeafNode {
  type: "leaf";
  id: string;
  sessionId: string;
}

export interface SplitNode {
  type: "split";
  id: string;
  direction: SplitDirection;
  children: [PaneNode, PaneNode];
  ratio: number; // 0..1, position of the divider
}

export type PaneNode = LeafNode | SplitNode;

interface ClosedPane {
  pane: LeafNode;
  closedAt: number;
  parentId: string | null;
  position: "first" | "second";
}

interface PaneState {
  root: PaneNode | null;
  activePaneId: string | null;
  closedPanes: ClosedPane[];
}

interface PaneActions {
  // Initialize with a single pane.
  initSinglePane: (sessionId: string) => string;

  // Split the active pane in a given direction.
  splitPane: (direction: SplitDirection, newSessionId: string) => string | null;

  // Close a pane by ID (moves to undo buffer).
  closePane: (id: string) => void;

  // Undo the most recent close.
  undoClose: () => ClosedPane | null;

  // Focus a pane by ID.
  focusPane: (id: string) => void;

  // Update the split ratio of a split node.
  resizePane: (splitId: string, ratio: number) => void;

  // Get all leaf panes.
  getLeaves: () => LeafNode[];

  // Navigate focus in a direction.
  navigateFocus: (dir: "left" | "right" | "up" | "down") => void;
}

let nextPaneId = 1;
function generatePaneId(): string {
  return `pane-${nextPaneId++}`;
}

let nextSplitId = 1;
function generateSplitId(): string {
  return `split-${nextSplitId++}`;
}

// ── Helpers ──

function findNodeById(node: PaneNode, id: string): PaneNode | null {
  if (node.id === id) return node;
  if (node.type === "split") {
    return (
      findNodeById(node.children[0], id) ??
      findNodeById(node.children[1], id)
    );
  }
  return null;
}

function findParent(
  node: PaneNode,
  targetId: string,
): { parent: SplitNode; index: 0 | 1 } | null {
  if (node.type === "split") {
    if (node.children[0].id === targetId) return { parent: node, index: 0 };
    if (node.children[1].id === targetId) return { parent: node, index: 1 };
    return (
      findParent(node.children[0], targetId) ??
      findParent(node.children[1], targetId)
    );
  }
  return null;
}

function replaceNode(
  root: PaneNode,
  targetId: string,
  replacement: PaneNode,
): PaneNode {
  if (root.id === targetId) return replacement;
  if (root.type === "split") {
    return {
      ...root,
      children: [
        replaceNode(root.children[0], targetId, replacement),
        replaceNode(root.children[1], targetId, replacement),
      ],
    };
  }
  return root;
}

function collectLeaves(node: PaneNode): LeafNode[] {
  if (node.type === "leaf") return [node];
  return [
    ...collectLeaves(node.children[0]),
    ...collectLeaves(node.children[1]),
  ];
}

function getFirstLeaf(node: PaneNode): LeafNode {
  if (node.type === "leaf") return node;
  return getFirstLeaf(node.children[0]);
}

// ── Store ──

export const usePaneStore = create<PaneState & PaneActions>()((set, get) => ({
  root: null,
  activePaneId: null,
  closedPanes: [],

  initSinglePane: (sessionId: string) => {
    const id = generatePaneId();
    set({
      root: { type: "leaf", id, sessionId },
      activePaneId: id,
    });
    return id;
  },

  splitPane: (direction: SplitDirection, newSessionId: string) => {
    const { root, activePaneId } = get();
    if (!root || !activePaneId) return null;

    const target = findNodeById(root, activePaneId);
    if (!target || target.type !== "leaf") return null;

    const newPaneId = generatePaneId();
    const newLeaf: LeafNode = {
      type: "leaf",
      id: newPaneId,
      sessionId: newSessionId,
    };

    const splitNode: SplitNode = {
      type: "split",
      id: generateSplitId(),
      direction,
      children: [target, newLeaf],
      ratio: 0.5,
    };

    const newRoot = replaceNode(root, activePaneId, splitNode);
    set({ root: newRoot, activePaneId: newPaneId });
    return newPaneId;
  },

  closePane: (id: string) => {
    const { root, activePaneId, closedPanes } = get();
    if (!root) return;

    // Can't close the last pane.
    const leaves = collectLeaves(root);
    if (leaves.length <= 1) return;

    const target = findNodeById(root, id);
    if (!target || target.type !== "leaf") return;

    const parentResult = findParent(root, id);
    if (!parentResult) return;

    const { parent, index } = parentResult;
    const sibling = parent.children[index === 0 ? 1 : 0];

    // Replace the parent split with the sibling.
    const newRoot = replaceNode(root, parent.id, sibling);

    // Determine new active pane.
    const newActive =
      activePaneId === id ? getFirstLeaf(sibling).id : activePaneId;

    // Add to undo buffer.
    const closedPane: ClosedPane = {
      pane: target,
      closedAt: Date.now(),
      parentId: parent.id,
      position: index === 0 ? "first" : "second",
    };

    set({
      root: newRoot,
      activePaneId: newActive,
      closedPanes: [closedPane, ...closedPanes].slice(0, 5), // Keep last 5
    });

    // Auto-expire after 8 seconds.
    setTimeout(() => {
      set((state) => ({
        closedPanes: state.closedPanes.filter((p) => p !== closedPane),
      }));
    }, 8000);
  },

  undoClose: () => {
    const { closedPanes } = get();
    if (closedPanes.length === 0) return null;

    const [restored, ...remaining] = closedPanes;

    // Re-split the current active pane to bring back the closed pane.
    const { root, activePaneId } = get();
    if (!root || !activePaneId) return null;

    const currentLeaf = findNodeById(root, activePaneId);
    if (!currentLeaf) return null;

    const splitNode: SplitNode = {
      type: "split",
      id: generateSplitId(),
      direction: "horizontal",
      children:
        restored.position === "first"
          ? [restored.pane, currentLeaf as LeafNode]
          : [currentLeaf as LeafNode, restored.pane],
      ratio: 0.5,
    };

    const newRoot = replaceNode(root, activePaneId, splitNode);
    set({
      root: newRoot,
      activePaneId: restored.pane.id,
      closedPanes: remaining,
    });

    return restored;
  },

  focusPane: (id: string) => {
    set({ activePaneId: id });
  },

  resizePane: (splitId: string, ratio: number) => {
    const { root } = get();
    if (!root) return;

    const clamped = Math.max(0.1, Math.min(0.9, ratio));

    function updateRatio(node: PaneNode): PaneNode {
      if (node.id === splitId && node.type === "split") {
        return { ...node, ratio: clamped };
      }
      if (node.type === "split") {
        return {
          ...node,
          children: [
            updateRatio(node.children[0]),
            updateRatio(node.children[1]),
          ],
        };
      }
      return node;
    }

    set({ root: updateRatio(root) });
  },

  getLeaves: () => {
    const { root } = get();
    if (!root) return [];
    return collectLeaves(root);
  },

  navigateFocus: (dir: "left" | "right" | "up" | "down") => {
    const { root, activePaneId } = get();
    if (!root || !activePaneId) return;

    const leaves = collectLeaves(root);
    const currentIndex = leaves.findIndex((l) => l.id === activePaneId);
    if (currentIndex === -1) return;

    // Simple linear navigation for now. Left/Up = previous, Right/Down = next.
    let newIndex: number;
    if (dir === "left" || dir === "up") {
      newIndex = (currentIndex - 1 + leaves.length) % leaves.length;
    } else {
      newIndex = (currentIndex + 1) % leaves.length;
    }

    set({ activePaneId: leaves[newIndex].id });
  },
}));
