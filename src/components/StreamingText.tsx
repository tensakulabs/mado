import { memo } from "react";

interface StreamingTextProps {
  text: string;
}

/**
 * Renders in-progress assistant response with a blinking cursor.
 */
export const StreamingText = memo(function StreamingText({
  text,
}: StreamingTextProps) {
  return (
    <div className="px-4 py-3">
      {/* Header */}
      <div className="mb-1 flex items-center text-xs text-gray-500">
        <span className="text-green-400">Claude</span>
        <span className="mx-2">·</span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-400" />
          typing...
        </span>
      </div>

      {/* Streaming content */}
      <div className="whitespace-pre-wrap text-sm text-gray-100">
        {text}
        <span className="inline-block h-4 w-0.5 animate-pulse bg-gray-400" />
      </div>
    </div>
  );
});
