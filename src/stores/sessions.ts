import { create } from "zustand";
import {
  type Session,
  type CliSessionInfo,
  listSessions,
  listCliSessions as ipcListCliSessions,
  createSession as ipcCreateSession,
  destroySession as ipcDestroySession,
} from "../lib/ipc";

interface SessionState {
  sessions: Session[];
  cliSessions: CliSessionInfo[];
  isLoading: boolean;
  error: string | null;
  defaultModel: string;
  // Per-session model overrides (sessionId -> model).
  modelOverrides: Map<string, string>;
}

interface SessionActions {
  fetchSessions: () => Promise<void>;
  fetchCliSessions: (workingDir: string) => Promise<void>;
  createSession: (
    name: string,
    model: string,
    rows: number,
    cols: number,
    cwd?: string,
  ) => Promise<Session>;
  destroySession: (sessionId: string) => Promise<void>;
  getSession: (sessionId: string) => Session | undefined;
  getSessionsByWorkspace: (workingDir: string) => Session[];
  setDefaultModel: (model: string) => void;
  // Per-session model selection.
  getSessionModel: (sessionId: string) => string;
  setSessionModel: (sessionId: string, model: string) => void;
  // Update session's working directory.
  updateWorkingDir: (sessionId: string, workingDir: string) => Promise<void>;
  // Link a Mado session to a CLI session (sets claude_session_id locally).
  linkClaudeSession: (sessionId: string, claudeSessionId: string) => void;
}

export const useSessionStore = create<SessionState & SessionActions>()(
  (set, get) => ({
    sessions: [],
    cliSessions: [],
    isLoading: false,
    error: null,
    defaultModel: "sonnet",
    modelOverrides: new Map(),

    fetchSessions: async () => {
      set({ isLoading: true, error: null });
      try {
        const sessions = await listSessions();
        set({ sessions, isLoading: false });
      } catch (err) {
        set({ error: String(err), isLoading: false });
      }
    },

    fetchCliSessions: async (workingDir: string) => {
      try {
        const cliSessions = await ipcListCliSessions(workingDir, 50);
        set({ cliSessions });
      } catch (err) {
        console.warn("Failed to fetch CLI sessions:", err);
      }
    },

    createSession: async (
      name: string,
      model: string,
      rows: number,
      cols: number,
      cwd?: string,
    ) => {
      // Reuse an existing empty session with the same workspace instead of
      // creating a new one.
      if (cwd) {
        const existing = get().sessions.find(
          (s) => s.message_count === 0 && s.working_dir === cwd,
        );
        if (existing) return existing;
      }

      const session = await ipcCreateSession(name, model, rows, cols, cwd);
      set((state) => ({
        sessions: [...state.sessions, session],
      }));
      return session;
    },

    destroySession: async (sessionId: string) => {
      await ipcDestroySession(sessionId);
      set((state) => ({
        sessions: state.sessions.filter((s) => s.id !== sessionId),
      }));
    },

    getSession: (sessionId: string) => {
      return get().sessions.find((s) => s.id === sessionId);
    },

    getSessionsByWorkspace: (workingDir: string) => {
      return get().sessions.filter((s) => s.working_dir === workingDir);
    },

    setDefaultModel: (model: string) => {
      set({ defaultModel: model });
    },

    getSessionModel: (sessionId: string) => {
      const override = get().modelOverrides.get(sessionId);
      if (override) return override;
      // Fall back to session's original model or default.
      const session = get().sessions.find((s) => s.id === sessionId);
      return session?.model ?? get().defaultModel;
    },

    setSessionModel: (sessionId: string, model: string) => {
      set((state) => {
        const newOverrides = new Map(state.modelOverrides);
        newOverrides.set(sessionId, model);
        return { modelOverrides: newOverrides };
      });
    },

    updateWorkingDir: async (sessionId: string, workingDir: string) => {
      // Update local state. Backend IPC can be added later if needed.
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === sessionId ? { ...s, working_dir: workingDir } : s,
        ),
      }));
    },

    linkClaudeSession: (sessionId: string, claudeSessionId: string) => {
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === sessionId ? { ...s, claude_session_id: claudeSessionId } : s,
        ),
      }));
    },

  }),
);
