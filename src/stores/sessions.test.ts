import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the IPC module before importing the store.
vi.mock("../lib/ipc", () => ({
  listSessions: vi.fn(),
  createSession: vi.fn(),
  destroySession: vi.fn(),
}));

import { useSessionStore } from "./sessions";
import * as ipc from "../lib/ipc";

describe("sessions store", () => {
  beforeEach(() => {
    // Reset store state before each test.
    useSessionStore.setState({
      sessions: [],
      isLoading: false,
      error: null,
      defaultModel: "sonnet",
      modelOverrides: new Map(),
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("fetchSessions", () => {
    it("fetches sessions from IPC and updates store", async () => {
      const mockSessions = [
        {
          id: "session-1",
          name: "Test Session",
          model: "sonnet",
          status: "active",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
          shell_fallback: false,
          message_count: 0,
        },
      ];
      vi.mocked(ipc.listSessions).mockResolvedValue(mockSessions);

      const store = useSessionStore.getState();
      await store.fetchSessions();

      const state = useSessionStore.getState();
      expect(state.sessions).toEqual(mockSessions);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it("handles fetch errors", async () => {
      vi.mocked(ipc.listSessions).mockRejectedValue(new Error("Connection failed"));

      const store = useSessionStore.getState();
      await store.fetchSessions();

      const state = useSessionStore.getState();
      expect(state.sessions).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe("Error: Connection failed");
    });
  });

  describe("createSession", () => {
    it("creates a session and adds it to the store", async () => {
      const mockSession = {
        id: "new-session-id",
        name: "New Session",
        model: "opus",
        status: "active",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        shell_fallback: false,
        message_count: 0,
      };
      vi.mocked(ipc.createSession).mockResolvedValue(mockSession);

      const store = useSessionStore.getState();
      const result = await store.createSession("New Session", "opus", 24, 80);

      expect(result).toEqual(mockSession);
      expect(ipc.createSession).toHaveBeenCalledWith("New Session", "opus", 24, 80, undefined);

      const state = useSessionStore.getState();
      expect(state.sessions).toContainEqual(mockSession);
    });

    it("passes cwd when provided", async () => {
      const mockSession = {
        id: "folder-session-id",
        name: "Folder Session",
        model: "sonnet",
        status: "active",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        working_dir: "/Users/test/project",
        shell_fallback: false,
        message_count: 0,
      };
      vi.mocked(ipc.createSession).mockResolvedValue(mockSession);

      const store = useSessionStore.getState();
      await store.createSession("Folder Session", "sonnet", 24, 80, "/Users/test/project");

      expect(ipc.createSession).toHaveBeenCalledWith(
        "Folder Session",
        "sonnet",
        24,
        80,
        "/Users/test/project"
      );
    });
  });

  describe("destroySession", () => {
    it("destroys a session and removes it from the store", async () => {
      // Set up initial state with a session.
      useSessionStore.setState({
        sessions: [
          {
            id: "session-to-delete",
            name: "Delete Me",
            model: "sonnet",
            status: "active",
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
            shell_fallback: false,
            message_count: 0,
          },
        ],
      });
      vi.mocked(ipc.destroySession).mockResolvedValue();

      const store = useSessionStore.getState();
      await store.destroySession("session-to-delete");

      const state = useSessionStore.getState();
      expect(state.sessions).toEqual([]);
      expect(ipc.destroySession).toHaveBeenCalledWith("session-to-delete");
    });
  });

  describe("getSession", () => {
    it("returns the session with the given ID", () => {
      const mockSession = {
        id: "find-me",
        name: "Find Me",
        model: "sonnet",
        status: "active",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        shell_fallback: false,
        message_count: 0,
      };
      useSessionStore.setState({
        sessions: [mockSession],
      });

      const store = useSessionStore.getState();
      const result = store.getSession("find-me");

      expect(result).toEqual(mockSession);
    });

    it("returns undefined for unknown session ID", () => {
      const store = useSessionStore.getState();
      const result = store.getSession("unknown-id");

      expect(result).toBeUndefined();
    });
  });

  describe("setDefaultModel", () => {
    it("updates the default model", () => {
      const store = useSessionStore.getState();
      store.setDefaultModel("opus");

      const state = useSessionStore.getState();
      expect(state.defaultModel).toBe("opus");
    });
  });

  describe("getSessionsByWorkspace", () => {
    it("returns sessions matching the given working_dir", () => {
      useSessionStore.setState({
        sessions: [
          {
            id: "s1",
            name: "Project A",
            model: "sonnet",
            status: "active",
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
            working_dir: "/Users/test/project-a",
            shell_fallback: false,
            message_count: 3,
          },
          {
            id: "s2",
            name: "Project B",
            model: "sonnet",
            status: "active",
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
            working_dir: "/Users/test/project-b",
            shell_fallback: false,
            message_count: 1,
          },
          {
            id: "s3",
            name: "Also Project A",
            model: "opus",
            status: "active",
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
            working_dir: "/Users/test/project-a",
            shell_fallback: false,
            message_count: 0,
          },
        ],
      });

      const store = useSessionStore.getState();
      const result = store.getSessionsByWorkspace("/Users/test/project-a");

      expect(result).toHaveLength(2);
      expect(result.map((s) => s.id)).toEqual(["s1", "s3"]);
    });

    it("returns empty array when no sessions match", () => {
      useSessionStore.setState({
        sessions: [
          {
            id: "s1",
            name: "Project A",
            model: "sonnet",
            status: "active",
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
            working_dir: "/Users/test/project-a",
            shell_fallback: false,
            message_count: 0,
          },
        ],
      });

      const store = useSessionStore.getState();
      const result = store.getSessionsByWorkspace("/Users/test/nonexistent");

      expect(result).toEqual([]);
    });

    it("excludes sessions without working_dir", () => {
      useSessionStore.setState({
        sessions: [
          {
            id: "s1",
            name: "No Workspace",
            model: "sonnet",
            status: "active",
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
            shell_fallback: false,
            message_count: 0,
          },
          {
            id: "s2",
            name: "Has Workspace",
            model: "sonnet",
            status: "active",
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
            working_dir: "/Users/test/project",
            shell_fallback: false,
            message_count: 0,
          },
        ],
      });

      const store = useSessionStore.getState();
      const result = store.getSessionsByWorkspace("/Users/test/project");

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("s2");
    });
  });
});
