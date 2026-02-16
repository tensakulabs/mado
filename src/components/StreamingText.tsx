import { memo } from "react";
import { useUiStore } from "../stores/ui";

interface StreamingTextProps {
  text: string;
}

/**
 * Renders in-progress assistant response matching MessageBubble layout.
 * Shows plain text during streaming - markdown renders when message completes.
 */
export const StreamingText = memo(function StreamingText({
  text,
}: StreamingTextProps) {
  const aiName = useUiStore((s) => s.aiName);

  return (
    <div className="group flex pt-3 px-4">
      {/* Left column - avatar */}
      <div className="w-16 flex-shrink-0">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-base font-medium cursor-default select-none"
          style={{
            backgroundColor: 'var(--color-aiIndicator)',
            color: 'var(--color-bgPrimary)'
          }}
        >
          {aiName.charAt(0).toUpperCase()}
        </div>
      </div>

      {/* Content column */}
      <div className="flex-1 min-w-0 pb-1">
        {/* Header: name + timestamp (matches MessageBubble) */}
        <div className="flex items-baseline gap-2 text-sm mb-0.5 cursor-default select-none">
          <span style={{ color: 'var(--color-aiIndicator)' }} className="font-medium">
            {aiName}
          </span>
          <span className="text-theme-muted">
            {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>

        {/* Streaming content - plain text with preserved whitespace */}
        <div className="whitespace-pre-wrap text-sm text-theme-primary leading-relaxed">
          {text}
          <span className="inline-block h-4 w-0.5 animate-pulse bg-blue-400 ml-0.5" />
        </div>
      </div>
    </div>
  );
});
