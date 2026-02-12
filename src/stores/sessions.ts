import { create } from "zustand";
import {
  type Session,
  listSessions,
  createSession as ipcCreateSession,
  destroySession as ipcDestroySession,
} from "../lib/ipc";

interface SessionState {
  sessions: Session[];
  isLoading: boolean;
  error: string | null;
}

interface SessionActions {
  fetchSessions: () => Promise<void>;
  createSession: (
    name: string,
    model: string,
    rows: number,
    cols: number,
  ) => Promise<Session>;
  destroySession: (sessionId: string) => Promise<void>;
  getSession: (sessionId: string) => Session | undefined;
}

export const useSessionStore = create<SessionState & SessionActions>()(
  (set, get) => ({
    sessions: [],
    isLoading: false,
    error: null,

    fetchSessions: async () => {
      set({ isLoading: true, error: null });
      try {
        const sessions = await listSessions();
        set({ sessions, isLoading: false });
      } catch (err) {
        set({ error: String(err), isLoading: false });
      }
    },

    createSession: async (
      name: string,
      model: string,
      rows: number,
      cols: number,
    ) => {
      const session = await ipcCreateSession(name, model, rows, cols);
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
  }),
);
