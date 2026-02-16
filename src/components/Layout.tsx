import { useCallback, useRef } from "react";
import { type PaneNode, usePaneStore } from "../stores/panes";
import { Pane } from "./Pane";

const MIN_PANE_SIZE = 100; // pixels

/**
 * Recursively renders the pane tree with draggable split handles.
 */
export function Layout() {
  const root = usePaneStore((s) => s.root);

  if (!root) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-theme-secondary">
        <p className="text-sm text-theme-muted">No panes</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <PaneTreeNode node={root} />
    </div>
  );
}

function PaneTreeNode({ node }: { node: PaneNode }) {
  if (node.type === "leaf") {
    return <Pane paneId={node.id} sessionId={node.sessionId} />;
  }

  return <SplitView node={node} />;
}

function SplitView({
  node,
}: {
  node: Extract<PaneNode, { type: "split" }>;
}) {
  const resizePane = usePaneStore((s) => s.resizePane);
  const containerRef = useRef<HTMLDivElement>(null);

  const isHorizontal = node.direction === "horizontal";

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const totalSize = isHorizontal ? rect.width : rect.height;
      const offset = isHorizontal ? rect.left : rect.top;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const pos = isHorizontal ? moveEvent.clientX : moveEvent.clientY;
        let ratio = (pos - offset) / totalSize;

        // Enforce minimum size.
        const minRatio = MIN_PANE_SIZE / totalSize;
        ratio = Math.max(minRatio, Math.min(1 - minRatio, ratio));

        resizePane(node.id, ratio);
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      document.body.style.cursor = isHorizontal ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
    },
    [node.id, isHorizontal, resizePane],
  );

  const firstPercent = `${node.ratio * 100}%`;
  const secondPercent = `${(1 - node.ratio) * 100}%`;

  return (
    <div
      ref={containerRef}
      className={`flex h-full w-full ${
        isHorizontal ? "flex-row" : "flex-col"
      }`}
    >
      {/* First child */}
      <div
        style={{
          flexBasis: firstPercent,
          flexGrow: 0,
          flexShrink: 0,
          minWidth: isHorizontal ? MIN_PANE_SIZE : undefined,
          minHeight: !isHorizontal ? MIN_PANE_SIZE : undefined,
          overflow: "hidden",
        }}
      >
        <PaneTreeNode node={node.children[0]} />
      </div>

      {/* Drag handle */}
      <div
        className={`${
          isHorizontal
            ? "w-1 cursor-col-resize hover:bg-blue-500/40"
            : "h-1 cursor-row-resize hover:bg-blue-500/40"
        } flex-shrink-0 bg-theme-tertiary transition-colors`}
        onMouseDown={handleMouseDown}
      />

      {/* Second child */}
      <div
        style={{
          flexBasis: secondPercent,
          flexGrow: 0,
          flexShrink: 0,
          minWidth: isHorizontal ? MIN_PANE_SIZE : undefined,
          minHeight: !isHorizontal ? MIN_PANE_SIZE : undefined,
          overflow: "hidden",
        }}
      >
        <PaneTreeNode node={node.children[1]} />
      </div>
    </div>
  );
}
