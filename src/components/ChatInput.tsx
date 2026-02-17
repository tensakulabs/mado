import { useState, useRef, useCallback, KeyboardEvent } from "react";
import { getContextWindow } from "../lib/models";

interface ChatInputProps {
  sessionId: string;
  onSend: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
  model?: string;
  contextPercent?: number;
}

/**
 * Chat input component with multiline textarea.
 * Enter sends, Shift+Enter adds newline.
 */
export function ChatInput({
  onSend,
  disabled = false,
  placeholder = "Type a message...",
  model,
  contextPercent,
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
    <div className="border-t border-theme-primary bg-theme-secondary p-3">
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
          className={`flex-1 resize-none rounded-lg border border-theme-primary bg-theme-tertiary px-4 py-2 text-sm text-theme-primary placeholder:text-theme-muted focus:border-theme-accent focus:outline-none focus:ring-1 focus:ring-blue-500 ${
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
      <div className="mt-1 text-xs text-theme-muted">
        <div>Press Enter to send, Shift+Enter for new line</div>
        {model && (
          <div className="flex items-center gap-2 mt-1">
            <span className="font-medium text-blue-400">{model.charAt(0).toUpperCase() + model.slice(1)}</span>
            <div className="w-24 h-2.5 bg-theme-tertiary rounded overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded transition-all"
                style={{ width: `${Math.min(contextPercent ?? 0, 100)}%` }}
              />
            </div>
            <span className="text-theme-secondary">
              {contextPercent && contextPercent > 0
                ? (() => {
                    const contextWindow = getContextWindow(model ?? "sonnet");
                    const usedK = Math.round((contextPercent / 100) * (contextWindow / 1000));
                    const maxK = contextWindow / 1000;
                    return `${contextPercent.toFixed(0)}% (${usedK}K / ${maxK}K)`;
                  })()
                : "0%"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
