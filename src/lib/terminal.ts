import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

export interface TerminalInstance {
  terminal: Terminal;
  fitAddon: FitAddon;
  dispose: () => void;
}

const THEME = {
  background: "#0f0f23",
  foreground: "#e0e0e0",
  cursor: "#e0e0e0",
  cursorAccent: "#0f0f23",
  selectionBackground: "#3a3a5e",
  selectionForeground: "#ffffff",
  black: "#1a1a2e",
  red: "#f87171",
  green: "#4ade80",
  yellow: "#facc15",
  blue: "#60a5fa",
  magenta: "#c084fc",
  cyan: "#22d3ee",
  white: "#e0e0e0",
  brightBlack: "#6b7280",
  brightRed: "#fca5a5",
  brightGreen: "#86efac",
  brightYellow: "#fde68a",
  brightBlue: "#93c5fd",
  brightMagenta: "#d8b4fe",
  brightCyan: "#67e8f9",
  brightWhite: "#ffffff",
};

/**
 * Create and configure an xterm.js terminal instance inside a container element.
 *
 * Sets up FitAddon, WebGL rendering (with DOM fallback), and web links.
 * Uses a ResizeObserver with debouncing for reliable resize handling.
 */
export function createTerminal(container: HTMLElement): TerminalInstance {
  const terminal = new Terminal({
    fontFamily: '"Cascadia Code", "Fira Code", "Menlo", "Monaco", monospace',
    fontSize: 14,
    lineHeight: 1.2,
    theme: THEME,
    cursorBlink: true,
    cursorStyle: "block",
    allowProposedApi: true,
    scrollback: 10000,
    convertEol: true,
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

  // Web links addon for clickable URLs.
  const webLinksAddon = new WebLinksAddon();
  terminal.loadAddon(webLinksAddon);

  // Open the terminal in the container.
  terminal.open(container);

  // Try to load WebGL renderer for better performance.
  try {
    const webglAddon = new WebglAddon();
    webglAddon.onContextLoss(() => {
      webglAddon.dispose();
    });
    terminal.loadAddon(webglAddon);
  } catch {
    // WebGL not available -- fall back to DOM renderer (built-in).
    console.warn("WebGL addon not available, using DOM renderer");
  }

  // Initial fit.
  fitAddon.fit();

  // Set up debounced resize via ResizeObserver.
  let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
  const resizeObserver = new ResizeObserver(() => {
    if (resizeTimeout) {
      clearTimeout(resizeTimeout);
    }
    resizeTimeout = setTimeout(() => {
      fitAddon.fit();
    }, 200);
  });
  resizeObserver.observe(container);

  const dispose = () => {
    if (resizeTimeout) {
      clearTimeout(resizeTimeout);
    }
    resizeObserver.disconnect();
    terminal.dispose();
  };

  return { terminal, fitAddon, dispose };
}
