import { create } from "zustand";
import {
  type Message,
  type StreamEvent,
  getMessages as ipcGetMessages,
  sendMessage as ipcSendMessage,
  cancelResponse as ipcCancelResponse,
  attachChatSession,
} from "../lib/ipc";

type ConversationState = "empty" | "idle" | "streaming" | "error";

interface PerSessionState {
  messages: Message[];
  streamingText: string;
  streamingToolCalls: Map<string, { name: string; output?: string }>;
  state: ConversationState;
  error: string | null;
}

interface ConversationStoreState {
  sessions: Map<string, PerSessionState>;
  activeChannels: Map<string, ReturnType<typeof attachChatSession>>;
}

interface ConversationStoreActions {
  // Initialize or get session state.
  initSession: (sessionId: string) => void;

  // Load messages from daemon.
  loadMessages: (sessionId: string) => Promise<void>;

  // Send a message.
  sendMessage: (sessionId: string, content: string, model?: string) => Promise<void>;

  // Cancel a response.
  cancelResponse: (sessionId: string) => Promise<void>;

  // Subscribe to streaming events.
  subscribeToStream: (sessionId: string) => void;

  // Unsubscribe from streaming.
  unsubscribeFromStream: (sessionId: string) => void;

  // Handle a stream event.
  handleStreamEvent: (sessionId: string, event: StreamEvent) => void;

  // Get session state.
  getSessionState: (sessionId: string) => PerSessionState | undefined;

  // Get messages for a session.
  getMessages: (sessionId: string) => Message[];

  // Get streaming text for a session.
  getStreamingText: (sessionId: string) => string;

  // Get conversation state.
  getState: (sessionId: string) => ConversationState;
}

const defaultSessionState = (): PerSessionState => ({
  messages: [],
  streamingText: "",
  streamingToolCalls: new Map(),
  state: "empty",
  error: null,
});

export const useConversationStore = create<
  ConversationStoreState & ConversationStoreActions
>()((set, get) => ({
  sessions: new Map(),
  activeChannels: new Map(),

  initSession: (sessionId: string) => {
    set((state) => {
      if (!state.sessions.has(sessionId)) {
        const newSessions = new Map(state.sessions);
        newSessions.set(sessionId, defaultSessionState());
        return { sessions: newSessions };
      }
      return state;
    });
  },

  loadMessages: async (sessionId: string) => {
    get().initSession(sessionId);

    try {
      const messages = await ipcGetMessages(sessionId);
      set((state) => {
        const newSessions = new Map(state.sessions);
        const session = newSessions.get(sessionId) || defaultSessionState();
        newSessions.set(sessionId, {
          ...session,
          messages,
          state: messages.length > 0 ? "idle" : "empty",
        });
        return { sessions: newSessions };
      });
    } catch (err) {
      set((state) => {
        const newSessions = new Map(state.sessions);
        const session = newSessions.get(sessionId) || defaultSessionState();
        newSessions.set(sessionId, {
          ...session,
          error: String(err),
          state: "error",
        });
        return { sessions: newSessions };
      });
    }
  },

  sendMessage: async (sessionId: string, content: string, model?: string) => {
    get().initSession(sessionId);

    // Add user message immediately.
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      tool_calls: [],
      timestamp: new Date().toISOString(),
    };

    set((state) => {
      const newSessions = new Map(state.sessions);
      const session = newSessions.get(sessionId) || defaultSessionState();
      newSessions.set(sessionId, {
        ...session,
        messages: [...session.messages, userMessage],
        streamingText: "",
        streamingToolCalls: new Map(),
        state: "streaming",
        error: null,
      });
      return { sessions: newSessions };
    });

    // Subscribe to stream events if not already.
    if (!get().activeChannels.has(sessionId)) {
      get().subscribeToStream(sessionId);
    }

    try {
      await ipcSendMessage(sessionId, content, model);
    } catch (err) {
      set((state) => {
        const newSessions = new Map(state.sessions);
        const session = newSessions.get(sessionId) || defaultSessionState();
        newSessions.set(sessionId, {
          ...session,
          error: String(err),
          state: "error",
        });
        return { sessions: newSessions };
      });
    }
  },

  cancelResponse: async (sessionId: string) => {
    try {
      await ipcCancelResponse(sessionId);
      set((state) => {
        const newSessions = new Map(state.sessions);
        const session = newSessions.get(sessionId);
        if (session) {
          newSessions.set(sessionId, {
            ...session,
            streamingText: "",
            state: "idle",
          });
        }
        return { sessions: newSessions };
      });
    } catch (err) {
      console.error("Failed to cancel response:", err);
    }
  },

  subscribeToStream: (sessionId: string) => {
    // Check if already subscribed.
    if (get().activeChannels.has(sessionId)) {
      return;
    }

    const { promise, channel } = attachChatSession(sessionId, (event) => {
      get().handleStreamEvent(sessionId, event);
    });

    set((state) => {
      const newChannels = new Map(state.activeChannels);
      newChannels.set(sessionId, { promise, channel });
      return { activeChannels: newChannels };
    });

    promise.catch((err) => {
      console.error("Chat stream error:", err);
      get().unsubscribeFromStream(sessionId);
    });
  },

  unsubscribeFromStream: (sessionId: string) => {
    set((state) => {
      const newChannels = new Map(state.activeChannels);
      newChannels.delete(sessionId);
      return { activeChannels: newChannels };
    });
  },

  handleStreamEvent: (sessionId: string, event: StreamEvent) => {
    set((state) => {
      const newSessions = new Map(state.sessions);
      const session = newSessions.get(sessionId) || defaultSessionState();

      switch (event.type) {
        case "text_delta":
          newSessions.set(sessionId, {
            ...session,
            streamingText: session.streamingText + event.text,
          });
          break;

        case "tool_use_start":
          const toolCalls = new Map(session.streamingToolCalls);
          toolCalls.set(event.tool_call_id, { name: event.name });
          newSessions.set(sessionId, {
            ...session,
            streamingToolCalls: toolCalls,
          });
          break;

        case "tool_result":
          const updatedToolCalls = new Map(session.streamingToolCalls);
          const existing = updatedToolCalls.get(event.tool_call_id);
          if (existing) {
            updatedToolCalls.set(event.tool_call_id, {
              ...existing,
              output: event.output,
            });
          }
          newSessions.set(sessionId, {
            ...session,
            streamingToolCalls: updatedToolCalls,
          });
          break;

        case "message_complete":
          newSessions.set(sessionId, {
            ...session,
            messages: [...session.messages, event.message],
            streamingText: "",
            streamingToolCalls: new Map(),
            state: "idle",
          });
          break;

        case "error":
          newSessions.set(sessionId, {
            ...session,
            error: event.message,
            state: "error",
          });
          break;

        case "idle":
          // Only update state if not already idle (avoids flicker).
          if (session.state === "streaming") {
            newSessions.set(sessionId, {
              ...session,
              state: "idle",
            });
          }
          break;
      }

      return { sessions: newSessions };
    });
  },

  getSessionState: (sessionId: string) => {
    return get().sessions.get(sessionId);
  },

  getMessages: (sessionId: string) => {
    return get().sessions.get(sessionId)?.messages || [];
  },

  getStreamingText: (sessionId: string) => {
    return get().sessions.get(sessionId)?.streamingText || "";
  },

  getState: (sessionId: string) => {
    return get().sessions.get(sessionId)?.state || "empty";
  },
}));
