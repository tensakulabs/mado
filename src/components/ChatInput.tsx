import { useState, useRef, useCallback, KeyboardEvent } from "react";

interface ChatInputProps {
  sessionId: string;
  onSend: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Chat input component with multiline textarea.
 * Enter sends, Shift+Enter adds newline.
 */
export function ChatInput({
  onSend,
  disabled = false,
  placeholder = "Type a message...",
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed && !disabled) {
      onSend(trimmed);
      setValue("");
      // Reset textarea height.
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleInput = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Auto-resize textarea.
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, []);

  return (
    <div className="border-t border-gray-700 bg-[#0f0f23] p-3">
      <div className="flex gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          className={`flex-1 resize-none rounded-lg border border-gray-600 bg-[#1a1a2e] px-4 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
            disabled ? "cursor-not-allowed opacity-50" : ""
          }`}
          style={{ minHeight: "40px", maxHeight: "200px" }}
        />
        <button
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          className={`rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors ${
            disabled || !value.trim()
              ? "cursor-not-allowed opacity-50"
              : "hover:bg-blue-500"
          }`}
        >
          Send
        </button>
      </div>
      <div className="mt-1 text-xs text-gray-500">
        Press Enter to send, Shift+Enter for new line
      </div>
    </div>
  );
}
