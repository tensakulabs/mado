import { create } from "zustand";
import { getConfig, updateConfig, getUserDisplayName } from "../lib/ipc";

// Theme preset definitions with CSS custom properties
export interface ThemePreset {
  id: string;
  name: string;
  colors: {
    // Backgrounds
    bgPrimary: string;
    bgSecondary: string;
    bgTertiary: string;
    // Borders
    borderPrimary: string;
    borderSecondary: string;
    // Text
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    // Accents
    accent: string;
    accentHover: string;
    // Status
    success: string;
    warning: string;
    error: string;
    // Role indicators
    aiIndicator: string;
    userIndicator: string;
    // Selection
    selection: string;
    selectionText: string;
  };
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "dark",
    name: "Dark",
    colors: {
      bgPrimary: "#0a0a1a",
      bgSecondary: "#0f0f23",
      bgTertiary: "#16213e",
      borderPrimary: "rgba(55, 65, 81, 0.5)",
      borderSecondary: "rgba(55, 65, 81, 0.3)",
      textPrimary: "#ffffff",
      textSecondary: "#d1d5db",
      textMuted: "#6b7280",
      accent: "#3b82f6",
      accentHover: "#2563eb",
      success: "#22c55e",
      warning: "#eab308",
      error: "#ef4444",
      aiIndicator: "#4ade80",
      userIndicator: "#60a5fa",
      selection: "rgba(59, 130, 246, 0.4)",
      selectionText: "#ffffff",
    },
  },
  {
    id: "light",
    name: "Light",
    colors: {
      bgPrimary: "#ffffff",
      bgSecondary: "#f9fafb",
      bgTertiary: "#f3f4f6",
      borderPrimary: "rgba(156, 163, 175, 0.6)",
      borderSecondary: "rgba(156, 163, 175, 0.4)",
      textPrimary: "#111827",
      textSecondary: "#374151",
      textMuted: "#4b5563",
      accent: "#2563eb",
      accentHover: "#1d4ed8",
      success: "#16a34a",
      warning: "#ca8a04",
      error: "#dc2626",
      aiIndicator: "#16a34a",
      userIndicator: "#2563eb",
      selection: "rgba(37, 99, 235, 0.3)",
      selectionText: "#111827",
    },
  },
  {
    id: "midnight",
    name: "Midnight",
    colors: {
      bgPrimary: "#0f172a",
      bgSecondary: "#1e293b",
      bgTertiary: "#334155",
      borderPrimary: "rgba(71, 85, 105, 0.5)",
      borderSecondary: "rgba(71, 85, 105, 0.3)",
      textPrimary: "#f8fafc",
      textSecondary: "#cbd5e1",
      textMuted: "#64748b",
      accent: "#6366f1",
      accentHover: "#4f46e5",
      success: "#22c55e",
      warning: "#f59e0b",
      error: "#f43f5e",
      aiIndicator: "#4ade80",
      userIndicator: "#818cf8",
      selection: "rgba(99, 102, 241, 0.4)",
      selectionText: "#f8fafc",
    },
  },
  {
    id: "forest",
    name: "Forest",
    colors: {
      bgPrimary: "#0c1810",
      bgSecondary: "#132218",
      bgTertiary: "#1a3020",
      borderPrimary: "rgba(34, 84, 61, 0.5)",
      borderSecondary: "rgba(34, 84, 61, 0.3)",
      textPrimary: "#f0fdf4",
      textSecondary: "#bbf7d0",
      textMuted: "#4ade80",
      accent: "#22c55e",
      accentHover: "#16a34a",
      success: "#4ade80",
      warning: "#fbbf24",
      error: "#f87171",
      aiIndicator: "#86efac",
      userIndicator: "#60a5fa",
      selection: "rgba(34, 197, 94, 0.3)",
      selectionText: "#f0fdf4",
    },
  },
];

interface UiState {
  theme: string;
  zoomLevel: number;
  showToolCalls: boolean;
  isLoading: boolean;
  userName: string;
  aiName: string;
  // Git view state
  currentView: "chat" | "git";
  gitViewSessionId: string | null;
  // Session sidebar state
  sidebarOpen: boolean;
}

interface UiActions {
  loadFromConfig: () => Promise<void>;
  setTheme: (theme: string) => Promise<void>;
  setZoomLevel: (level: number) => Promise<void>;
  setShowToolCalls: (show: boolean) => Promise<void>;
  setUserName: (name: string) => Promise<void>;
  setAiName: (name: string) => Promise<void>;
  getThemePreset: () => ThemePreset;
  applyTheme: () => void;
  // Git view actions
  openGitView: (sessionId: string) => void;
  closeGitView: () => void;
  // Session sidebar actions
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState & UiActions>()((set, get) => ({
  theme: "dark",
  zoomLevel: 100,
  showToolCalls: false,
  isLoading: true,
  userName: "You",
  aiName: "AI",
  currentView: "chat" as const,
  gitViewSessionId: null,
  sidebarOpen: false,

  loadFromConfig: async () => {
    try {
      const [config, systemName] = await Promise.all([
        getConfig(),
        getUserDisplayName().catch(() => "You"),
      ]);
      // Use config override if set, otherwise use system display name
      const userName = config.ui.user_name || systemName;
      const aiName = config.ui.ai_name || "AI";
      set({
        theme: config.ui.theme,
        zoomLevel: config.ui.zoom_level ?? 100,
        showToolCalls: config.ui.show_tool_calls ?? false,
        userName,
        aiName,
        isLoading: false,
      });
      get().applyTheme();
    } catch {
      set({ isLoading: false });
    }
  },

  setTheme: async (theme: string) => {
    set({ theme });
    get().applyTheme();
    try {
      const config = await getConfig();
      config.ui.theme = theme;
      await updateConfig(config);
    } catch (err) {
      console.error("Failed to save theme:", err);
    }
  },

  setZoomLevel: async (level: number) => {
    const clamped = Math.max(50, Math.min(200, level));
    set({ zoomLevel: clamped });
    get().applyTheme();
    try {
      const config = await getConfig();
      config.ui.zoom_level = clamped;
      await updateConfig(config);
    } catch (err) {
      console.error("Failed to save zoom level:", err);
    }
  },

  setShowToolCalls: async (show: boolean) => {
    set({ showToolCalls: show });
    try {
      const config = await getConfig();
      config.ui.show_tool_calls = show;
      await updateConfig(config);
    } catch (err) {
      console.error("Failed to save show tool calls:", err);
    }
  },

  setUserName: async (name: string) => {
    set({ userName: name });
    try {
      const config = await getConfig();
      config.ui.user_name = name;
      await updateConfig(config);
    } catch (err) {
      console.error("Failed to save user name:", err);
    }
  },

  setAiName: async (name: string) => {
    set({ aiName: name });
    try {
      const config = await getConfig();
      config.ui.ai_name = name;
      await updateConfig(config);
    } catch (err) {
      console.error("Failed to save AI name:", err);
    }
  },

  getThemePreset: () => {
    const { theme } = get();
    return THEME_PRESETS.find((p) => p.id === theme) ?? THEME_PRESETS[0];
  },

  applyTheme: () => {
    const { zoomLevel } = get();
    const preset = get().getThemePreset();
    const root = document.documentElement;

    // Apply colors
    Object.entries(preset.colors).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key}`, value);
    });

    // Apply zoom level
    root.style.setProperty("--zoom-level", `${zoomLevel / 100}`);
  },

  openGitView: (sessionId: string) => {
    set({ currentView: "git", gitViewSessionId: sessionId });
  },

  closeGitView: () => {
    set({ currentView: "chat", gitViewSessionId: null });
  },

  toggleSidebar: () => {
    set((state) => ({ sidebarOpen: !state.sidebarOpen }));
  },

  setSidebarOpen: (open: boolean) => {
    set({ sidebarOpen: open });
  },
}));
