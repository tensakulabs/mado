import { useEffect, useRef, useCallback, useMemo, useState } from "react";
import { useConversationStore } from "../stores/conversations";
import { useSessionStore } from "../stores/sessions";
import { ChatInput } from "./ChatInput";
import { MessageBubble } from "./MessageBubble";
import { StreamingText } from "./StreamingText";
import { listModels, type Message, type ToolCall, type ModelInfo } from "../lib/ipc";
import { getContextWindow } from "../lib/models";

// Check if a message has tool calls (used for aggregation)
function hasToolCalls(msg: Message): boolean {
  return (msg.tool_calls?.length ?? 0) > 0;
}

// Group messages - tool-only messages attach to previous content message
interface MessageGroup {
  message: Message;
  attachedToolCalls?: ToolCall[];
}

function groupMessages(messages: Message[]): MessageGroup[] {
  const groups: MessageGroup[] = [];

  for (const msg of messages) {
    const hasTC = hasToolCalls(msg);
    const isEmpty = msg.content.trim() === "" || msg.content.trim() === "{}";

    // Skip completely empty messages
    if (isEmpty && !hasTC) {
      continue;
    }

    if (isEmpty && hasTC) {
      // Tool-only message - find most recent assistant group to attach to
      // Look backwards through groups to find matching role
      let attached = false;
      for (let i = groups.length - 1; i >= 0; i--) {
        if (groups[i].message.role === msg.role) {
          groups[i].attachedToolCalls = [
            ...(groups[i].attachedToolCalls || []),
            ...(msg.tool_calls || []),
          ];
          attached = true;
          break;
        }
      }
      if (!attached) {
        // No previous group to attach to - create standalone
        groups.push({
          message: msg,
          attachedToolCalls: msg.tool_calls || [],
        });
      }
    } else {
      // Message with content - create new group
      groups.push({
        message: msg,
        attachedToolCalls: hasTC ? [...(msg.tool_calls || [])] : undefined,
      });
    }
  }

  return groups;
}

interface ChatViewProps {
  sessionId: string | null;
}

function DateSeparator({ date }: { date: Date }) {
  const formattedDate = date.toLocaleDateString([], {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="flex-1 border-t border-theme-primary" />
      <span className="text-xs text-theme-muted">{formattedDate}</span>
      <div className="flex-1 border-t border-theme-primary" />
    </div>
  );
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
  const messages = useConversationStore((s) => s.getMessages(sessionId));
  const streamingText = useConversationStore((s) => s.getStreamingText(sessionId));
  const conversationState = useConversationStore((s) => s.getState(sessionId));

  // Group consecutive AI messages with tool calls
  const groupedMessages = useMemo(() => groupMessages(messages), [messages]);

  const error = useConversationStore(
    (s) => (sessionId ? s.getSessionState(sessionId)?.error : null) ?? null,
  );

  const initSession = useConversationStore((s) => s.initSession);
  const loadMessages = useConversationStore((s) => s.loadMessages);
  const loadHistory = useConversationStore((s) => s.loadHistory);
  const sendMessage = useConversationStore((s) => s.sendMessage);
  const subscribeToStream = useConversationStore((s) => s.subscribeToStream);
  const getSessionModel = useSessionStore((s) => s.getSessionModel);
  const setSessionModel = useSessionStore((s) => s.setSessionModel);
  const hasExplicitWorkspace = useSessionStore((s) => s.hasExplicitWorkspace);

  // Track if initial load is complete
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Models for the dropdown
  const [models, setModels] = useState<ModelInfo[]>([
    { id: "opus", name: "Claude Opus", description: "Most capable" },
    { id: "sonnet", name: "Claude Sonnet", description: "Balanced" },
    { id: "haiku", name: "Claude Haiku", description: "Fastest" },
  ]);

  // Load models from backend
  useEffect(() => {
    listModels()
      .then((loaded) => {
        if (loaded.length > 0) setModels(loaded);
      })
      .catch(console.error);
  }, []);

  // Get current model for this session (must be before contextPercent which uses it)
  const currentModel = sessionId ? getSessionModel(sessionId) : "sonnet";

  // Calculate context usage from the last assistant message's usage data.
  // Total context = input_tokens + cache_read + cache_creation
  // Claude CLI reports:
  // - input_tokens: just the uncached new input
  // - cache_read_input_tokens: tokens read from cache (existing cached content)
  // - cache_creation_input_tokens: tokens being cached this turn
  // All three must be summed for accurate context window usage.
  const contextPercent = useMemo(() => {
    const contextWindow = getContextWindow(currentModel);
    // Find the last assistant message with usage data
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === "assistant" && msg.usage) {
        const inputTokens = msg.usage.input_tokens ?? 0;
        const cacheRead = msg.usage.cache_read_tokens ?? 0;
        const cacheWrite = msg.usage.cache_write_tokens ?? 0;
        // Sum ALL input sources for accurate context measurement
        const totalContext = inputTokens + cacheRead + cacheWrite;
        // Cap at 100% and ensure reasonable values
        const percent = (totalContext / contextWindow) * 100;
        return Math.min(percent, 100);
      }
    }
    return 0;
  }, [messages, currentModel]);

  // Initialize session and load messages.
  // Workspace sessions (user explicitly chose a folder) auto-load CLI history.
  // Default/bare conversations start blank.
  useEffect(() => {
    if (sessionId) {
      setIsInitialLoading(true);
      initSession(sessionId);
      subscribeToStream(sessionId);
      const loads: Promise<void>[] = [loadMessages(sessionId)];
      if (hasExplicitWorkspace(sessionId)) {
        loads.push(loadHistory(sessionId));
      }
      Promise.all(loads).finally(() => {
        setIsInitialLoading(false);
      });
    }
  }, [sessionId, initSession, loadMessages, loadHistory, subscribeToStream, hasExplicitWorkspace]);

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
      // Only auto-scroll if user is at the very bottom (within 5px tolerance).
      isUserScrolledUp.current = scrollHeight - scrollTop - clientHeight > 5;
    }
  }, []);

  const handleSend = useCallback(
    (content: string) => {
      if (sessionId) {
        // Reset scroll lock when sending.
        isUserScrolledUp.current = false;
        // Use per-session model selection.
        const model = getSessionModel(sessionId);
        sendMessage(sessionId, content, model);
      }
    },
    [sessionId, sendMessage, getSessionModel],
  );

  if (!sessionId) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-theme-secondary">
        <p className="text-sm text-theme-muted">No conversation selected</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-theme-secondary">
      {/* Messages area */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden"
      >
        {/* Loading state */}
        {isInitialLoading && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="flex justify-center mb-3">
                <svg className="animate-spin h-6 w-6 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
              <p className="text-sm text-theme-muted">Loading conversation...</p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!isInitialLoading && messages.length === 0 && conversationState !== "streaming" && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="mb-2 text-4xl">💬</div>
              <p className="text-sm text-theme-muted flex items-center gap-2">
                <span>Start a conversation using</span>
                <select
                  value={currentModel}
                  onChange={(e) => sessionId && setSessionModel(sessionId, e.target.value)}
                  className="appearance-none bg-theme-tertiary border border-theme-primary rounded px-2 py-1 pr-6 text-blue-400 font-medium cursor-pointer hover:border-blue-500 focus:outline-none focus:border-blue-500"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.25rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.25rem 1.25rem' }}
                >
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name.replace("Claude ", "")}
                    </option>
                  ))}
                </select>
              </p>
            </div>
          </div>
        )}

        {/* Message list */}
        {groupedMessages.map((group, groupIndex) => {
          const msg = group.message;
          const prevGroup = groupIndex > 0 ? groupedMessages[groupIndex - 1] : null;
          const prevMsg = prevGroup?.message ?? null;
          const msgDate = new Date(msg.timestamp).toDateString();
          const prevMsgDate = prevMsg ? new Date(prevMsg.timestamp).toDateString() : null;
          const isNewDate = !prevMsgDate || msgDate !== prevMsgDate;
          const showHeader = isNewDate || !prevMsg || prevMsg.role !== msg.role;

          return (
            <div key={msg.id}>
              {isNewDate && (
                <DateSeparator date={new Date(msg.timestamp)} />
              )}
              <MessageBubble
                message={msg}
                showHeader={showHeader}
                aggregatedToolCalls={group.attachedToolCalls}
              />
            </div>
          );
        })}

        {/* Streaming response */}
        {conversationState === "streaming" && streamingText && (
          <StreamingText text={streamingText} />
        )}

        {/* Loading indicator when waiting for response to start */}
        {conversationState === "streaming" && !streamingText && (
          <div className="px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-theme-muted">
              <div className="flex gap-1">
                <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-theme-tertiary [animation-delay:0ms]" />
                <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-theme-tertiary [animation-delay:150ms]" />
                <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-theme-tertiary [animation-delay:300ms]" />
              </div>
              <span>AI is thinking...</span>
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
        model={currentModel}
        contextPercent={contextPercent}
      />
    </div>
  );
}
