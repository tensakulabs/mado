import { memo, useState } from "react";
import type { Message, ToolCall } from "../lib/ipc";
import { MarkdownContent } from "./MarkdownContent";
import { Tooltip } from "./Tooltip";
import { useUiStore } from "../stores/ui";

interface MessageBubbleProps {
  message: Message;
  showHeader?: boolean;
  aggregatedToolCalls?: ToolCall[];
}

interface ToolCallBlockProps {
  toolCall: ToolCall;
}

function ToolCallBlock({ toolCall }: ToolCallBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const statusColor = {
    running: "text-yellow-400",
    completed: "text-green-400",
    failed: "text-red-400",
  }[toolCall.status];

  return (
    <div className="mt-2 rounded border border-theme-primary bg-theme-tertiary">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-theme-secondary"
      >
        <span className="flex items-center gap-2">
          <span className={statusColor}>
            {toolCall.status === "running" ? "⏳" : toolCall.status === "completed" ? "✓" : "✗"}
          </span>
          <span className="font-mono text-theme-secondary">{toolCall.name}</span>
        </span>
        <span className="text-theme-muted">{isExpanded ? "▼" : "▶"}</span>
      </button>
      {isExpanded && (
        <div className="border-t border-theme-primary px-3 py-2">
          <div className="mb-2">
            <div className="mb-1 text-xs text-theme-muted">Input:</div>
            <pre className="overflow-x-auto rounded bg-theme-secondary p-2 text-xs text-theme-secondary">
              {JSON.stringify(toolCall.input, null, 2)}
            </pre>
          </div>
          {toolCall.output && (
            <div>
              <div className="mb-1 text-xs text-theme-muted">Output:</div>
              <pre className="max-h-48 overflow-auto rounded bg-theme-secondary p-2 text-xs text-theme-secondary">
                {toolCall.output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface CompactToolCallsProps {
  toolCalls: ToolCall[];
}

function CompactToolCalls({ toolCalls }: CompactToolCallsProps) {
  // Group tool calls by name and count them
  const grouped = toolCalls.reduce<Record<string, { count: number; hasRunning: boolean; hasFailed: boolean }>>((acc, tc) => {
    if (!acc[tc.name]) {
      acc[tc.name] = { count: 0, hasRunning: false, hasFailed: false };
    }
    acc[tc.name].count++;
    if (tc.status === "running") acc[tc.name].hasRunning = true;
    if (tc.status === "failed") acc[tc.name].hasFailed = true;
    return acc;
  }, {});

  const entries = Object.entries(grouped);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-theme-muted">
      {entries.map(([name, { count, hasRunning, hasFailed }], index) => (
        <span key={name} className="flex items-center gap-1">
          <span className={hasRunning ? "text-yellow-400" : hasFailed ? "text-red-400" : "text-green-400"}>
            {hasRunning ? "⏳" : hasFailed ? "✗" : "✓"}
          </span>
          <span className="font-mono">{name}</span>
          {count > 1 && <span>×{count}</span>}
          {index < entries.length - 1 && <span className="ml-1">·</span>}
        </span>
      ))}
    </div>
  );
}

function CostIndicator({ cost }: { cost?: number }) {
  // Only show cost if present (token usage hidden for cleaner UI)
  if (!cost || cost <= 0) return null;

  return (
    <span className="ml-2 text-xs text-theme-muted">
      ${cost.toFixed(4)}
    </span>
  );
}

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatFullTimestamp(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // Show full locale date + time for older messages
  const dateStr = date.toLocaleDateString([], {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
  const timeStr = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${dateStr} ${timeStr}`;
}

function formatTooltipTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Render a single message in the conversation.
 * User messages have a different background color.
 * Assistant messages render markdown content.
 */
export const MessageBubble = memo(function MessageBubble({
  message,
  showHeader = true,
  aggregatedToolCalls,
}: MessageBubbleProps) {
  const showToolCalls = useUiStore((s) => s.showToolCalls);
  const userName = useUiStore((s) => s.userName);
  const aiName = useUiStore((s) => s.aiName);

  const isUser = message.role === "user";
  const trimmedContent = message.content.trim();
  const hasContent = trimmedContent.length > 0 && trimmedContent !== "{}";

  // Use aggregated tool calls if provided, otherwise use message's tool calls
  const toolCallsToShow = aggregatedToolCalls ?? message.tool_calls ?? [];
  const hasToolCalls = toolCallsToShow.length > 0;

  // Don't render empty messages (no content and no tool calls)
  if (!hasContent && !hasToolCalls) {
    return null;
  }

  return (
    <div className={`group flex ${showHeader ? "pt-3" : "pt-0.5"} px-4`}>
      {/* Left column - avatar for first message, timestamp on hover for consecutive */}
      <div className="w-16 flex-shrink-0 text-xs">
        {showHeader ? (
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-base font-medium cursor-default select-none"
            style={{
              backgroundColor: isUser ? 'var(--color-userIndicator)' : 'var(--color-aiIndicator)',
              color: 'var(--color-bgPrimary)'
            }}
          >
            {isUser ? userName.charAt(0).toUpperCase() : aiName.charAt(0).toUpperCase()}
          </div>
        ) : (
          <span className="invisible group-hover:visible text-left block pt-3 select-none">
            <Tooltip content={formatTooltipTimestamp(message.timestamp)} position="right">
              <span className="text-theme-muted cursor-default">{formatTimestamp(message.timestamp)}</span>
            </Tooltip>
          </span>
        )}
      </div>

      {/* Content column */}
      <div className="flex-1 min-w-0 pb-1">
        {/* Header: name + timestamp - only for first message in group */}
        {showHeader && (
          <div className="flex items-baseline gap-2 text-sm mb-0.5 cursor-default select-none">
            <span style={{ color: isUser ? 'var(--color-userIndicator)' : 'var(--color-aiIndicator)' }} className="font-medium">
              {isUser ? userName : aiName}
            </span>
            <Tooltip content={formatTooltipTimestamp(message.timestamp)}>
              <span className="text-theme-muted">{formatFullTimestamp(message.timestamp)}</span>
            </Tooltip>
            {!isUser && <CostIndicator cost={message.cost_usd} />}
          </div>
        )}

        {/* Message content */}
        {hasContent && (
          <MarkdownContent content={message.content} />
        )}

        {/* Tool calls */}
        {hasToolCalls && (
          showToolCalls ? (
            <div className="mt-2">
              {toolCallsToShow.map((tc) => (
                <ToolCallBlock key={tc.id} toolCall={tc} />
              ))}
            </div>
          ) : (
            <CompactToolCalls toolCalls={toolCallsToShow} />
          )
        )}
      </div>
    </div>
  );
});
