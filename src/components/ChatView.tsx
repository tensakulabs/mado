import { useEffect, useRef, useCallback } from "react";
import { useConversationStore } from "../stores/conversations";
import { ChatInput } from "./ChatInput";
import { MessageBubble } from "./MessageBubble";
import { StreamingText } from "./StreamingText";

interface ChatViewProps {
  sessionId: string | null;
}

/**
 * Main chat view component.
 * Displays message history, streaming response, and input.
 */
export function ChatView({ sessionId }: ChatViewProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isUserScrolledUp = useRef(false);

  // Store selectors.
  const messages = useConversationStore((s) =>
    sessionId ? s.getMessages(sessionId) : [],
  );
  const streamingText = useConversationStore((s) =>
    sessionId ? s.getStreamingText(sessionId) : "",
  );
  const conversationState = useConversationStore((s) =>
    sessionId ? s.getState(sessionId) : "empty",
  );
  const error = useConversationStore(
    (s) => (sessionId ? s.getSessionState(sessionId)?.error : null) ?? null,
  );

  const initSession = useConversationStore((s) => s.initSession);
  const loadMessages = useConversationStore((s) => s.loadMessages);
  const sendMessage = useConversationStore((s) => s.sendMessage);
  const subscribeToStream = useConversationStore((s) => s.subscribeToStream);

  // Initialize session and load messages.
  useEffect(() => {
    if (sessionId) {
      initSession(sessionId);
      loadMessages(sessionId);
      subscribeToStream(sessionId);
    }
  }, [sessionId, initSession, loadMessages, subscribeToStream]);

  // Auto-scroll to bottom when new messages arrive.
  useEffect(() => {
    if (!isUserScrolledUp.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, streamingText]);

  // Detect if user has scrolled up.
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (container) {
      const { scrollTop, scrollHeight, clientHeight } = container;
      // Consider "scrolled up" if more than 100px from bottom.
      isUserScrolledUp.current = scrollHeight - scrollTop - clientHeight > 100;
    }
  }, []);

  const handleSend = useCallback(
    (content: string) => {
      if (sessionId) {
        // Reset scroll lock when sending.
        isUserScrolledUp.current = false;
        sendMessage(sessionId, content);
      }
    },
    [sessionId, sendMessage],
  );

  if (!sessionId) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#0f0f23]">
        <p className="text-sm text-gray-500">No conversation selected</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#0f0f23]">
      {/* Messages area */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        {/* Empty state */}
        {messages.length === 0 && conversationState !== "streaming" && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="mb-2 text-4xl">💬</div>
              <p className="text-sm text-gray-500">
                Start a conversation with Claude
              </p>
            </div>
          </div>
        )}

        {/* Message list */}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Streaming response */}
        {conversationState === "streaming" && streamingText && (
          <StreamingText text={streamingText} />
        )}

        {/* Loading indicator when waiting for response to start */}
        {conversationState === "streaming" && !streamingText && (
          <div className="px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <div className="flex gap-1">
                <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-gray-500 [animation-delay:0ms]" />
                <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-gray-500 [animation-delay:150ms]" />
                <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-gray-500 [animation-delay:300ms]" />
              </div>
              <span>Claude is thinking...</span>
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="mx-4 my-2 rounded bg-red-900/30 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <ChatInput
        sessionId={sessionId}
        onSend={handleSend}
        disabled={conversationState === "streaming"}
        placeholder={
          conversationState === "streaming"
            ? "Waiting for response..."
            : "Type a message..."
        }
      />
    </div>
  );
}
