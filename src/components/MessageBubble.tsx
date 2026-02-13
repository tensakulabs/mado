import { memo, useState } from "react";
import type { Message, ToolCall } from "../lib/ipc";

interface MessageBubbleProps {
  message: Message;
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
    <div className="mt-2 rounded border border-gray-700 bg-[#1a1a2e]">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-gray-800"
      >
        <span className="flex items-center gap-2">
          <span className={statusColor}>
            {toolCall.status === "running" ? "⏳" : toolCall.status === "completed" ? "✓" : "✗"}
          </span>
          <span className="font-mono text-gray-300">{toolCall.name}</span>
        </span>
        <span className="text-gray-500">{isExpanded ? "▼" : "▶"}</span>
      </button>
      {isExpanded && (
        <div className="border-t border-gray-700 px-3 py-2">
          <div className="mb-2">
            <div className="mb-1 text-xs text-gray-500">Input:</div>
            <pre className="overflow-x-auto rounded bg-[#0f0f23] p-2 text-xs text-gray-300">
              {JSON.stringify(toolCall.input, null, 2)}
            </pre>
          </div>
          {toolCall.output && (
            <div>
              <div className="mb-1 text-xs text-gray-500">Output:</div>
              <pre className="max-h-48 overflow-auto rounded bg-[#0f0f23] p-2 text-xs text-gray-300">
                {toolCall.output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CostIndicator({
  usage,
  cost,
}: {
  usage?: Message["usage"];
  cost?: number;
}) {
  if (!usage && !cost) return null;

  return (
    <span className="ml-2 text-xs text-gray-600">
      {usage && (
        <span>
          {usage.input_tokens}↓ {usage.output_tokens}↑
        </span>
      )}
      {cost !== undefined && cost > 0 && (
        <span className="ml-1">${cost.toFixed(4)}</span>
      )}
    </span>
  );
}

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Render a single message in the conversation.
 * User messages have a different background color.
 * Assistant messages render markdown content.
 */
export const MessageBubble = memo(function MessageBubble({
  message,
}: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={`px-4 py-3 ${isUser ? "bg-blue-900/20" : ""}`}>
      {/* Header: role, timestamp, cost */}
      <div className="mb-1 flex items-center text-xs text-gray-500">
        <span className={isUser ? "text-blue-400" : "text-green-400"}>
          {isUser ? "You" : "Claude"}
        </span>
        <span className="mx-2">·</span>
        <span>{formatTimestamp(message.timestamp)}</span>
        {!isUser && (
          <CostIndicator usage={message.usage} cost={message.cost_usd} />
        )}
      </div>

      {/* Message content */}
      <div className="whitespace-pre-wrap text-sm text-gray-100">
        {message.content}
      </div>

      {/* Tool calls */}
      {message.tool_calls.length > 0 && (
        <div className="mt-2">
          {message.tool_calls.map((tc) => (
            <ToolCallBlock key={tc.id} toolCall={tc} />
          ))}
        </div>
      )}
    </div>
  );
});
