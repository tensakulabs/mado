import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type FileDiff } from "../../lib/ipc";
import { Tooltip } from "../Tooltip";

interface FileListProps {
  staged: FileDiff[];
  unstaged: FileDiff[];
  selectedFile: string | null;
  viewMode: "list" | "tree";
  onSelectFile: (path: string, isStaged: boolean) => void;
  onStageAll: () => void;
  onUnstageAll: () => void;
  onStagePaths: (paths: string[]) => void;
  onUnstagePaths: (paths: string[]) => void;
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
  isChecked: boolean;
  /** Override display name (e.g. just filename in tree view). Defaults to full path. */
  displayName?: string;
  /** Show a file icon before the name (used in tree view). */
  showFileIcon?: boolean;
  onSelect: () => void;
  onToggleCheck: () => void;
}

function FileRow({ file, isSelected, isChecked, displayName, showFileIcon, onSelect, onToggleCheck }: FileRowProps) {
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
      {/* Selection checkbox */}
      <Tooltip content={isChecked ? "Deselect" : "Select"}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleCheck();
          }}
          className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors ${
            isChecked
              ? "border-blue-500 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
              : "border-theme-primary text-theme-muted hover:border-theme-secondary hover:bg-theme-tertiary"
          }`}
          aria-label={isChecked ? "Deselect file" : "Select file"}
        >
        {isChecked && (
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
      </Tooltip>

      {/* Status dot */}
      <Tooltip content={statusLabel(file.status)}>
        <span
          className={`h-2 w-2 flex-shrink-0 rounded-full ${statusColor(file.status)}`}
        />
      </Tooltip>

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
      <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.879a1.5 1.5 0 0 1 1.06.44l1.122 1.12A1.5 1.5 0 0 0 9.62 5H12.5A1.5 1.5 0 0 1 14 6.5v1.384l-2.162 3.243A1.75 1.75 0 0 1 10.382 12H2.476a.476.476 0 0 1-.396-.737L4.677 7H2V4.5Z" />
      <path d="M5.25 7 2.5 11.25h7.882a.25.25 0 0 0 .208-.112L13.34 7H5.25Z" />
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
  checkedFiles: Set<string>;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  onSelectFile: (path: string, isStaged: boolean) => void;
  onToggleCheck: (path: string) => void;
  onToggleCheckBatch: (paths: string[]) => void;
}

function TreeNodeRenderer({
  node,
  depth,
  isStaged,
  selectedFile,
  checkedFiles,
  expandedFolders,
  onToggleFolder,
  onSelectFile,
  onToggleCheck,
  onToggleCheckBatch,
}: TreeNodeRendererProps) {
  // File leaf node -- delegate to FileRow with indentation
  if (node.file) {
    return (
      <div style={{ paddingLeft: `${depth * 16}px` }}>
        <FileRow
          file={node.file}
          isSelected={selectedFile === node.file.path}
          isChecked={checkedFiles.has(node.file.path)}
          displayName={node.name}
          showFileIcon
          onSelect={() => onSelectFile(node.file!.path, isStaged)}
          onToggleCheck={() => onToggleCheck(node.file!.path)}
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

  const folderFilePaths = useMemo(() => collectFilePaths(node), [node]);
  const allChecked = folderFilePaths.length > 0 && folderFilePaths.every((p) => checkedFiles.has(p));

  return (
    <div>
      <div
        role="treeitem"
        aria-expanded={isExpanded}
        onClick={() => onToggleFolder(node.fullPath)}
        style={{ paddingLeft: `${depth * 16}px` }}
        className="group flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-xs text-theme-muted transition-colors hover:bg-theme-tertiary"
      >
        {/* Select/deselect folder toggle */}
        <Tooltip content={allChecked ? `Deselect folder (${folderFilePaths.length})` : `Select folder (${folderFilePaths.length})`}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleCheckBatch(folderFilePaths);
            }}
            className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors ${
              allChecked
                ? "border-blue-500 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                : "border-theme-primary text-theme-muted hover:border-blue-500 hover:bg-blue-500/10 hover:text-blue-400"
            }`}
            aria-label={allChecked ? "Deselect folder" : "Select folder"}
          >
            {allChecked ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5 opacity-0 group-hover:opacity-60">
                <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        </Tooltip>
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
            checkedFiles={checkedFiles}
            expandedFolders={expandedFolders}
            onToggleFolder={onToggleFolder}
            onSelectFile={onSelectFile}
            onToggleCheck={onToggleCheck}
            onToggleCheckBatch={onToggleCheckBatch}
          />
        ))}
    </div>
  );
}

interface FileTreeViewProps {
  files: FileDiff[];
  isStaged: boolean;
  selectedFile: string | null;
  checkedFiles: Set<string>;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  onSelectFile: (path: string, isStaged: boolean) => void;
  onToggleCheck: (path: string) => void;
  onToggleCheckBatch: (paths: string[]) => void;
}

function FileTreeView({
  files,
  isStaged,
  selectedFile,
  checkedFiles,
  expandedFolders,
  onToggleFolder,
  onSelectFile,
  onToggleCheck,
  onToggleCheckBatch,
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
          checkedFiles={checkedFiles}
          expandedFolders={expandedFolders}
          onToggleFolder={onToggleFolder}
          onSelectFile={onSelectFile}
          onToggleCheck={onToggleCheck}
          onToggleCheckBatch={onToggleCheckBatch}
        />
      ))}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Recursively collect all file paths from a tree node (for folder-level staging). */
function collectFilePaths(node: TreeNode): string[] {
  if (node.file) return [node.file.path];
  return node.children.flatMap(collectFilePaths);
}

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
  onStageAll,
  onUnstageAll,
  onStagePaths,
  onUnstagePaths,
}: FileListProps) {
  // Expanded folder state for tree view (all folders start expanded).
  const allFiles = useMemo(() => [...staged, ...unstaged], [staged, unstaged]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => collectAllFolderPaths(allFiles),
  );

  // Checked (selected) files for batch stage/unstage operations.
  const [checkedFiles, setCheckedFiles] = useState<Set<string>>(new Set());

  // Clear checked files that no longer exist when file lists change.
  useEffect(() => {
    const allPaths = new Set(allFiles.map((f) => f.path));
    setCheckedFiles((prev) => {
      const next = new Set<string>();
      for (const p of prev) {
        if (allPaths.has(p)) next.add(p);
      }
      return next.size !== prev.size ? next : prev;
    });
  }, [allFiles]);

  const toggleChecked = useCallback((path: string) => {
    setCheckedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const toggleCheckedBatch = useCallback((paths: string[]) => {
    setCheckedFiles((prev) => {
      const next = new Set(prev);
      const allChecked = paths.every((p) => next.has(p));
      if (allChecked) {
        for (const p of paths) next.delete(p);
      } else {
        for (const p of paths) next.add(p);
      }
      return next;
    });
  }, []);

  // Counts of checked files in each section for header buttons.
  const stagedPaths = useMemo(() => new Set(staged.map((f) => f.path)), [staged]);
  const checkedStagedCount = useMemo(
    () => [...checkedFiles].filter((p) => stagedPaths.has(p)).length,
    [checkedFiles, stagedPaths],
  );
  const unstagedPaths = useMemo(() => new Set(unstaged.map((f) => f.path)), [unstaged]);
  const checkedUnstagedCount = useMemo(
    () => [...checkedFiles].filter((p) => unstagedPaths.has(p)).length,
    [checkedFiles, unstagedPaths],
  );

  const handleUnstageChecked = useCallback(async () => {
    const paths = [...checkedFiles].filter((p) => stagedPaths.has(p));
    if (paths.length === 0) return;
    await onUnstagePaths(paths);
    setCheckedFiles((prev) => {
      const next = new Set(prev);
      for (const p of paths) next.delete(p);
      return next;
    });
  }, [checkedFiles, stagedPaths, onUnstagePaths]);

  const handleStageChecked = useCallback(async () => {
    const paths = [...checkedFiles].filter((p) => unstagedPaths.has(p));
    if (paths.length === 0) return;
    await onStagePaths(paths);
    setCheckedFiles((prev) => {
      const next = new Set(prev);
      for (const p of paths) next.delete(p);
      return next;
    });
  }, [checkedFiles, unstagedPaths, onStagePaths]);

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
        onSelectFile(allFiles[next].path, next < staged.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = currentIndex > 0 ? currentIndex - 1 : allFiles.length - 1;
        onSelectFile(allFiles[prev].path, prev < staged.length);
      }
    },
    [allFiles, staged.length, selectedFile, onSelectFile],
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
          <span className="text-xs font-medium text-green-400">
            Staged ({staged.length})
          </span>
          <div className="flex items-center gap-1.5">
            {checkedStagedCount > 0 && (
              <Tooltip content={`Unstage ${checkedStagedCount} selected file${checkedStagedCount !== 1 ? "s" : ""}`}>
                <button
                  onClick={handleUnstageChecked}
                  className="rounded px-1.5 py-0.5 text-xs text-red-400 hover:bg-red-900/20 transition-colors"
                >
                  Unstage ({checkedStagedCount})
                </button>
              </Tooltip>
            )}
            {staged.length > 0 && (
              <Tooltip content="Unstage all files">
                <button
                  onClick={onUnstageAll}
                  className="rounded px-1.5 py-0.5 text-xs text-theme-muted hover:bg-red-900/20 hover:text-red-400 transition-colors"
                >
                  Unstage all
                </button>
              </Tooltip>
            )}
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
            checkedFiles={checkedFiles}
            expandedFolders={expandedFolders}
            onToggleFolder={handleToggleFolder}
            onSelectFile={(path) => onSelectFile(path, true)}
            onToggleCheck={toggleChecked}
            onToggleCheckBatch={toggleCheckedBatch}
          />
        ) : (
          <div className="p-1">
            {staged.map((file) => (
              <FileRow
                key={`staged-${file.path}`}
                file={file}
                isSelected={selectedFile === file.path}
                isChecked={checkedFiles.has(file.path)}
                onSelect={() => onSelectFile(file.path, true)}
                onToggleCheck={() => toggleChecked(file.path)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Unstaged section */}
      <div className="flex-1 overflow-y-auto">
        <div className="sticky top-0 flex items-center justify-between border-b border-t border-theme-primary bg-theme-primary px-3 py-2">
          <span className="text-xs font-medium text-yellow-400">
            Unstaged ({unstaged.length})
          </span>
          <div className="flex items-center gap-1.5">
            {checkedUnstagedCount > 0 && (
              <Tooltip content={`Stage ${checkedUnstagedCount} selected file${checkedUnstagedCount !== 1 ? "s" : ""}`}>
                <button
                  onClick={handleStageChecked}
                  className="rounded px-1.5 py-0.5 text-xs text-green-400 hover:bg-green-900/20 transition-colors"
                >
                  Stage ({checkedUnstagedCount})
                </button>
              </Tooltip>
            )}
            {unstaged.length > 0 && (
              <Tooltip content="Stage all files">
                <button
                  onClick={onStageAll}
                  className="rounded px-1.5 py-0.5 text-xs text-theme-muted hover:bg-green-900/20 hover:text-green-400 transition-colors"
                >
                  Stage all
                </button>
              </Tooltip>
            )}
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
            checkedFiles={checkedFiles}
            expandedFolders={expandedFolders}
            onToggleFolder={handleToggleFolder}
            onSelectFile={(path) => onSelectFile(path, false)}
            onToggleCheck={toggleChecked}
            onToggleCheckBatch={toggleCheckedBatch}
          />
        ) : (
          <div className="p-1">
            {unstaged.map((file) => (
              <FileRow
                key={`unstaged-${file.path}`}
                file={file}
                isSelected={selectedFile === file.path}
                isChecked={checkedFiles.has(file.path)}
                onSelect={() => onSelectFile(file.path, false)}
                onToggleCheck={() => toggleChecked(file.path)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
