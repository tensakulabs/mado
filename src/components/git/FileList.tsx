import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type FileDiff } from "../../lib/ipc";

interface FileListProps {
  staged: FileDiff[];
  unstaged: FileDiff[];
  selectedFile: string | null;
  viewMode: "list" | "tree";
  onSelectFile: (path: string) => void;
  onStageFile: (path: string) => void;
  onUnstageFile: (path: string) => void;
  onStageAll: () => void;
  onUnstageAll: () => void;
}

/** Status color dot matching ChangeDetails.tsx patterns. */
function statusColor(status: string): string {
  switch (status) {
    case "added":
      return "bg-green-500";
    case "deleted":
      return "bg-red-500";
    case "renamed":
      return "bg-blue-500";
    default:
      return "bg-yellow-500";
  }
}

/** Status label for screen-reader / title text. */
function statusLabel(status: string): string {
  switch (status) {
    case "added":
      return "Added";
    case "deleted":
      return "Deleted";
    case "renamed":
      return "Renamed";
    default:
      return "Modified";
  }
}

interface FileRowProps {
  file: FileDiff;
  isSelected: boolean;
  isStaged: boolean;
  /** Override display name (e.g. just filename in tree view). Defaults to full path. */
  displayName?: string;
  /** Show a file icon before the name (used in tree view). */
  showFileIcon?: boolean;
  onSelect: () => void;
  onToggle: () => void;
}

function FileRow({ file, isSelected, isStaged, displayName, showFileIcon, onSelect, onToggle }: FileRowProps) {
  return (
    <div
      role="option"
      aria-selected={isSelected}
      tabIndex={-1}
      onClick={onSelect}
      className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs cursor-pointer transition-colors ${
        isSelected
          ? "bg-blue-900/40 text-theme-primary"
          : "text-theme-muted hover:bg-theme-tertiary"
      }`}
    >
      {/* Stage/unstage toggle */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors ${
          isStaged
            ? "border-green-500 bg-green-500/20 text-green-400 hover:bg-green-500/30"
            : "border-theme-primary text-theme-muted hover:border-theme-secondary hover:bg-theme-tertiary"
        }`}
        title={isStaged ? "Unstage file" : "Stage file"}
      >
        {isStaged && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="h-3 w-3"
          >
            <path
              fillRule="evenodd"
              d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </button>

      {/* Status dot */}
      <span
        className={`h-2 w-2 flex-shrink-0 rounded-full ${statusColor(file.status)}`}
        title={statusLabel(file.status)}
      />

      {/* File icon (tree view only) */}
      {showFileIcon && <FileIcon className="h-3.5 w-3.5 flex-shrink-0 text-theme-muted" />}

      {/* File path */}
      <span className="flex-1 truncate font-mono">{displayName ?? file.path}</span>
    </div>
  );
}

// ─── Tree View Types & Helpers ───────────────────────────────────────────────

interface TreeNode {
  /** Segment name (e.g. "components" or "FileList.tsx") */
  name: string;
  /** Full path from root (used as key and for stage/unstage) */
  fullPath: string;
  /** Child directories, sorted alphabetically */
  children: TreeNode[];
  /** Leaf file, present only on file nodes */
  file?: FileDiff;
}

/** Parse flat FileDiff[] into a nested tree rooted at an invisible root node. */
function buildTree(files: FileDiff[]): TreeNode {
  const root: TreeNode = { name: "", fullPath: "", children: [] };

  for (const file of files) {
    const segments = file.path.split("/");
    let current = root;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const isFile = i === segments.length - 1;
      const partialPath = segments.slice(0, i + 1).join("/");

      if (isFile) {
        current.children.push({
          name: segment,
          fullPath: file.path,
          children: [],
          file,
        });
      } else {
        let existing = current.children.find(
          (c) => !c.file && c.name === segment,
        );
        if (!existing) {
          existing = { name: segment, fullPath: partialPath, children: [] };
          current.children.push(existing);
        }
        current = existing;
      }
    }
  }

  return root;
}

// ─── SVG Icons ───────────────────────────────────────────────────────────────

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className ?? "h-3 w-3"}
    >
      <path
        fillRule="evenodd"
        d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className ?? "h-3 w-3"}
    >
      <path
        fillRule="evenodd"
        d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0l-3.25-3.25a.75.75 0 0 1 0-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className ?? "h-3.5 w-3.5"}
    >
      <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h2.879a1.5 1.5 0 0 1 1.06.44l1.122 1.12A1.5 1.5 0 0 0 9.62 4H12.5A1.5 1.5 0 0 1 14 5.5v7a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9Z" />
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className ?? "h-3.5 w-3.5"}
    >
      <path d="M4 2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6.414A2 2 0 0 0 13.414 5L11 2.586A2 2 0 0 0 9.586 2H4Z" />
    </svg>
  );
}

// ─── Tree Rendering Components ───────────────────────────────────────────────

interface TreeNodeRendererProps {
  node: TreeNode;
  depth: number;
  isStaged: boolean;
  selectedFile: string | null;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  onSelectFile: (path: string) => void;
  onToggleStage: (path: string) => void;
}

function TreeNodeRenderer({
  node,
  depth,
  isStaged,
  selectedFile,
  expandedFolders,
  onToggleFolder,
  onSelectFile,
  onToggleStage,
}: TreeNodeRendererProps) {
  // File leaf node -- delegate to FileRow with indentation
  if (node.file) {
    return (
      <div style={{ paddingLeft: `${depth * 16}px` }}>
        <FileRow
          file={node.file}
          isSelected={selectedFile === node.file.path}
          isStaged={isStaged}
          displayName={node.name}
          showFileIcon
          onSelect={() => onSelectFile(node.file!.path)}
          onToggle={() => onToggleStage(node.file!.path)}
        />
      </div>
    );
  }

  // Directory node
  const isExpanded = expandedFolders.has(node.fullPath);
  // Sort: directories first, then files, each group alphabetical
  const sorted = [...node.children].sort((a, b) => {
    if (a.file && !b.file) return 1;
    if (!a.file && b.file) return -1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div>
      <div
        role="treeitem"
        aria-expanded={isExpanded}
        onClick={() => onToggleFolder(node.fullPath)}
        style={{ paddingLeft: `${depth * 16}px` }}
        className="flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-xs text-theme-muted transition-colors hover:bg-theme-tertiary"
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3 flex-shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 flex-shrink-0" />
        )}
        <FolderIcon className="h-3.5 w-3.5 flex-shrink-0 text-blue-400" />
        <span className="truncate font-mono">{node.name}</span>
      </div>
      {isExpanded &&
        sorted.map((child) => (
          <TreeNodeRenderer
            key={child.fullPath}
            node={child}
            depth={depth + 1}
            isStaged={isStaged}
            selectedFile={selectedFile}
            expandedFolders={expandedFolders}
            onToggleFolder={onToggleFolder}
            onSelectFile={onSelectFile}
            onToggleStage={onToggleStage}
          />
        ))}
    </div>
  );
}

interface FileTreeViewProps {
  files: FileDiff[];
  isStaged: boolean;
  selectedFile: string | null;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  onSelectFile: (path: string) => void;
  onToggleStage: (path: string) => void;
}

function FileTreeView({
  files,
  isStaged,
  selectedFile,
  expandedFolders,
  onToggleFolder,
  onSelectFile,
  onToggleStage,
}: FileTreeViewProps) {
  const tree = useMemo(() => buildTree(files), [files]);

  // Sort root children: directories first, then files
  const sorted = [...tree.children].sort((a, b) => {
    if (a.file && !b.file) return 1;
    if (!a.file && b.file) return -1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="p-1" role="tree">
      {sorted.map((child) => (
        <TreeNodeRenderer
          key={child.fullPath}
          node={child}
          depth={0}
          isStaged={isStaged}
          selectedFile={selectedFile}
          expandedFolders={expandedFolders}
          onToggleFolder={onToggleFolder}
          onSelectFile={onSelectFile}
          onToggleStage={onToggleStage}
        />
      ))}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Collect all unique directory paths from a set of files, used to initialize expanded state. */
function collectAllFolderPaths(files: FileDiff[]): Set<string> {
  const paths = new Set<string>();
  for (const file of files) {
    const segments = file.path.split("/");
    for (let i = 1; i < segments.length; i++) {
      paths.add(segments.slice(0, i).join("/"));
    }
  }
  return paths;
}

/**
 * Left panel of the GitView showing staged and unstaged file lists.
 * Supports keyboard navigation with arrow keys.
 */
export function FileList({
  staged,
  unstaged,
  selectedFile,
  viewMode,
  onSelectFile,
  onStageFile,
  onUnstageFile,
  onStageAll,
  onUnstageAll,
}: FileListProps) {
  // Expanded folder state for tree view (all folders start expanded).
  const allFiles = useMemo(() => [...staged, ...unstaged], [staged, unstaged]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => collectAllFolderPaths(allFiles),
  );

  // When files change, expand any new folders that appear.
  const prevFilesRef = useRef(allFiles);
  useEffect(() => {
    if (prevFilesRef.current !== allFiles) {
      prevFilesRef.current = allFiles;
      setExpandedFolders((prev) => {
        const all = collectAllFolderPaths(allFiles);
        // Merge: keep existing collapsed state, but add any new folders as expanded
        const next = new Set(prev);
        for (const p of all) {
          // Only add if it's genuinely new (not previously known)
          if (!prev.has(p) && !prevCollapsedRef.current.has(p)) {
            next.add(p);
          }
        }
        return next;
      });
    }
  }, [allFiles]);

  // Track explicitly collapsed folders so we don't re-expand them on file changes.
  const prevCollapsedRef = useRef<Set<string>>(new Set());

  const handleToggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
        prevCollapsedRef.current.add(path);
      } else {
        next.add(path);
        prevCollapsedRef.current.delete(path);
      }
      return next;
    });
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (allFiles.length === 0) return;

      const currentIndex = selectedFile
        ? allFiles.findIndex((f) => f.path === selectedFile)
        : -1;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = currentIndex < allFiles.length - 1 ? currentIndex + 1 : 0;
        onSelectFile(allFiles[next].path);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = currentIndex > 0 ? currentIndex - 1 : allFiles.length - 1;
        onSelectFile(allFiles[prev].path);
      }
    },
    [allFiles, selectedFile, onSelectFile],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener("keydown", handleKeyDown);
    return () => container.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="listbox"
      aria-label="File changes"
      className="flex h-full flex-col overflow-hidden border-r border-theme-primary bg-theme-secondary focus:outline-none"
    >
      {/* Staged section */}
      <div className="flex-shrink-0">
        <div className="sticky top-0 flex items-center justify-between border-b border-theme-primary bg-theme-primary px-3 py-2">
          <div className="flex items-center gap-2">
            {/* Unstage all checkbox */}
            {staged.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUnstageAll();
                }}
                className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border border-green-500 bg-green-500/20 text-green-400 hover:bg-green-500/30"
                title="Unstage all files"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className="h-3 w-3"
                >
                  <path
                    fillRule="evenodd"
                    d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            )}
            <span className="text-xs font-medium text-green-400">
              Staged ({staged.length})
            </span>
          </div>
        </div>
        {staged.length === 0 ? (
          <div className="px-3 py-3">
            <p className="text-xs text-theme-muted">No staged files</p>
          </div>
        ) : viewMode === "tree" ? (
          <FileTreeView
            files={staged}
            isStaged={true}
            selectedFile={selectedFile}
            expandedFolders={expandedFolders}
            onToggleFolder={handleToggleFolder}
            onSelectFile={onSelectFile}
            onToggleStage={onUnstageFile}
          />
        ) : (
          <div className="p-1">
            {staged.map((file) => (
              <FileRow
                key={`staged-${file.path}`}
                file={file}
                isSelected={selectedFile === file.path}
                isStaged={true}
                onSelect={() => onSelectFile(file.path)}
                onToggle={() => onUnstageFile(file.path)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Unstaged section */}
      <div className="flex-1 overflow-y-auto">
        <div className="sticky top-0 flex items-center justify-between border-b border-t border-theme-primary bg-theme-primary px-3 py-2">
          <div className="flex items-center gap-2">
            {/* Stage all checkbox */}
            {unstaged.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onStageAll();
                }}
                className="group flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border border-theme-primary text-theme-muted hover:border-green-500 hover:bg-green-500/10 hover:text-green-400"
                title="Stage all files"
              >
                {/* Checkmark appears on hover to hint the action */}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className="h-2.5 w-2.5 opacity-0 group-hover:opacity-60"
                >
                  <path
                    fillRule="evenodd"
                    d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            )}
            <span className="text-xs font-medium text-yellow-400">
              Unstaged ({unstaged.length})
            </span>
          </div>
        </div>
        {unstaged.length === 0 ? (
          <div className="px-3 py-3">
            <p className="text-xs text-theme-muted">No unstaged files</p>
          </div>
        ) : viewMode === "tree" ? (
          <FileTreeView
            files={unstaged}
            isStaged={false}
            selectedFile={selectedFile}
            expandedFolders={expandedFolders}
            onToggleFolder={handleToggleFolder}
            onSelectFile={onSelectFile}
            onToggleStage={onStageFile}
          />
        ) : (
          <div className="p-1">
            {unstaged.map((file) => (
              <FileRow
                key={`unstaged-${file.path}`}
                file={file}
                isSelected={selectedFile === file.path}
                isStaged={false}
                onSelect={() => onSelectFile(file.path)}
                onToggle={() => onStageFile(file.path)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
