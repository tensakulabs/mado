import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { usePaneStore } from "../stores/panes";
import { useSessionStore } from "../stores/sessions";

interface CommandAction {
  id: string;
  label: string;
  description?: string;
  shortcut?: string;
  category: string;
  action: () => void | Promise<void>;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
}

/**
 * Command palette component (Cmd+K).
 * Provides fuzzy-searchable access to all app actions.
 */
export function CommandPalette({ isOpen, onClose, onOpenSettings }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Pane actions.
  const splitPane = usePaneStore((s) => s.splitPane);
  const closePane = usePaneStore((s) => s.closePane);
  const undoClose = usePaneStore((s) => s.undoClose);
  const activePaneId = usePaneStore((s) => s.activePaneId);
  const navigateFocus = usePaneStore((s) => s.navigateFocus);
  const root = usePaneStore((s) => s.root);
  const initSinglePane = usePaneStore((s) => s.initSinglePane);
  const getLeaves = usePaneStore((s) => s.getLeaves);

  // Session actions.
  const createSession = useSessionStore((s) => s.createSession);
  const defaultModel = useSessionStore((s) => s.defaultModel);
  const setDefaultModel = useSessionStore((s) => s.setDefaultModel);

  // Build command list.
  const commands = useMemo<CommandAction[]>(() => {
    const cmds: CommandAction[] = [
      // Conversations
      {
        id: "new-conversation",
        label: "New Conversation",
        description: "Start a new AI conversation",
        shortcut: "Ctrl+B c",
        category: "Conversations",
        action: async () => {
          const session = await createSession(
            `conversation-${Date.now()}`,
            defaultModel,
            24,
            80,
          );
          splitPane("horizontal", session.id);
        },
      },
      {
        id: "close-conversation",
        label: "Close Conversation",
        description: "Close the active conversation",
        shortcut: "Ctrl+B x",
        category: "Conversations",
        action: () => {
          if (activePaneId) closePane(activePaneId);
        },
      },
      {
        id: "undo-close",
        label: "Undo Close",
        description: "Restore the last closed conversation",
        shortcut: "Ctrl+B z",
        category: "Conversations",
        action: () => {
          undoClose();
        },
      },

      // Layout / Spaces
      {
        id: "split-horizontal",
        label: "Split Horizontal",
        description: "Split the active space horizontally",
        shortcut: 'Ctrl+B "',
        category: "Spaces",
        action: async () => {
          const session = await createSession(
            `conversation-${Date.now()}`,
            defaultModel,
            24,
            80,
          );
          splitPane("horizontal", session.id);
        },
      },
      {
        id: "split-vertical",
        label: "Split Vertical",
        description: "Split the active space vertically",
        shortcut: "Ctrl+B %",
        category: "Spaces",
        action: async () => {
          const session = await createSession(
            `conversation-${Date.now()}`,
            defaultModel,
            24,
            80,
          );
          splitPane("vertical", session.id);
        },
      },
      {
        id: "focus-left",
        label: "Focus Left",
        description: "Move focus to left space",
        shortcut: "Ctrl+B Left",
        category: "Spaces",
        action: () => navigateFocus("left"),
      },
      {
        id: "focus-right",
        label: "Focus Right",
        description: "Move focus to right space",
        shortcut: "Ctrl+B Right",
        category: "Spaces",
        action: () => navigateFocus("right"),
      },
      {
        id: "focus-up",
        label: "Focus Up",
        description: "Move focus to space above",
        shortcut: "Ctrl+B Up",
        category: "Spaces",
        action: () => navigateFocus("up"),
      },
      {
        id: "focus-down",
        label: "Focus Down",
        description: "Move focus to space below",
        shortcut: "Ctrl+B Down",
        category: "Spaces",
        action: () => navigateFocus("down"),
      },
      {
        id: "go-home",
        label: "Go Home",
        description: "Return to single-conversation view",
        category: "Spaces",
        action: () => {
          // Find the active pane's session and reset to single pane.
          const leaves = getLeaves();
          const active = leaves.find((l) => l.id === activePaneId);
          if (active) {
            initSinglePane(active.sessionId);
          } else if (leaves.length > 0) {
            initSinglePane(leaves[0].sessionId);
          }
        },
      },

      // Model selection
      {
        id: "model-opus",
        label: "Switch to Claude Opus",
        description: "Most capable, best for complex tasks",
        category: "Model",
        action: () => setDefaultModel("opus"),
      },
      {
        id: "model-sonnet",
        label: "Switch to Claude Sonnet",
        description: "Balanced performance and speed",
        category: "Model",
        action: () => setDefaultModel("sonnet"),
      },
      {
        id: "model-haiku",
        label: "Switch to Claude Haiku",
        description: "Fastest, great for quick tasks",
        category: "Model",
        action: () => setDefaultModel("haiku"),
      },

      // Settings
      {
        id: "settings",
        label: "Settings",
        description: "Open settings panel",
        category: "App",
        action: () => onOpenSettings(),
      },
    ];

    return cmds;
  }, [
    createSession,
    defaultModel,
    splitPane,
    closePane,
    undoClose,
    activePaneId,
    navigateFocus,
    getLeaves,
    initSinglePane,
    setDefaultModel,
    root,
    onOpenSettings,
  ]);

  // Fuzzy search.
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;

    const lowerQuery = query.toLowerCase();
    const tokens = lowerQuery.split(/\s+/);

    return commands
      .map((cmd) => {
        const searchText =
          `${cmd.label} ${cmd.description ?? ""} ${cmd.category}`.toLowerCase();

        // All tokens must match somewhere.
        const allMatch = tokens.every((token) => searchText.includes(token));
        if (!allMatch) return null;

        // Score: exact match in label > description > category.
        let score = 0;
        const labelLower = cmd.label.toLowerCase();
        if (labelLower.startsWith(lowerQuery)) score += 100;
        else if (labelLower.includes(lowerQuery)) score += 50;
        tokens.forEach((token) => {
          if (labelLower.includes(token)) score += 10;
        });

        return { cmd, score };
      })
      .filter(Boolean)
      .sort((a, b) => b!.score - a!.score)
      .map((item) => item!.cmd);
  }, [commands, query]);

  // Reset selection when query changes.
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input when opened.
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Scroll selected item into view.
  useEffect(() => {
    if (listRef.current) {
      const item = listRef.current.children[selectedIndex] as HTMLElement;
      if (item) {
        item.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) =>
            Math.min(i + 1, filteredCommands.length - 1),
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            filteredCommands[selectedIndex].action();
            onClose();
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [filteredCommands, selectedIndex, onClose],
  );

  if (!isOpen) return null;

  // Group by category.
  const groupedCommands = filteredCommands.reduce(
    (acc, cmd) => {
      if (!acc[cmd.category]) acc[cmd.category] = [];
      acc[cmd.category].push(cmd);
      return acc;
    },
    {} as Record<string, CommandAction[]>,
  );

  let globalIndex = 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Palette */}
      <div className="relative w-full max-w-lg rounded-xl border border-theme-primary bg-theme-secondary shadow-2xl">
        {/* Input */}
        <div className="flex items-center border-b border-theme-primary px-4 py-3">
          <span className="mr-2 text-theme-muted">{">"}</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            className="flex-1 bg-transparent text-sm text-theme-primary placeholder:text-theme-muted outline-none"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="ml-2 rounded border border-theme-primary bg-theme-tertiary px-1.5 py-0.5 text-[10px] text-theme-muted">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-64 overflow-y-auto py-1">
          {filteredCommands.length === 0 && (
            <div className="px-4 py-3 text-center text-sm text-theme-muted">
              No matching commands
            </div>
          )}

          {Object.entries(groupedCommands).map(([category, cmds]) => (
            <div key={category}>
              <div className="px-4 py-1 text-[10px] font-medium uppercase tracking-wider text-theme-muted">
                {category}
              </div>
              {cmds.map((cmd) => {
                const index = globalIndex++;
                const isSelected = index === selectedIndex;
                return (
                  <button
                    key={cmd.id}
                    onClick={() => {
                      cmd.action();
                      onClose();
                    }}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`flex w-full items-center justify-between px-4 py-1.5 text-left text-sm ${
                      isSelected
                        ? "bg-blue-900/30 text-theme-primary"
                        : "text-theme-secondary hover:bg-theme-tertiary"
                    }`}
                  >
                    <div>
                      <span className="font-medium">{cmd.label}</span>
                      {cmd.description && (
                        <span className="ml-2 text-xs text-theme-muted">
                          {cmd.description}
                        </span>
                      )}
                    </div>
                    {cmd.shortcut && (
                      <kbd className="ml-4 text-[10px] text-theme-muted">
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
