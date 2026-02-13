import { useEffect, useRef, useState } from "react";
import { createTerminal, type TerminalInstance } from "../lib/terminal";
import {
  attachSession,
  writeInput,
  resizeSession,
} from "../lib/ipc";

export interface UseTerminalResult {
  containerRef: React.RefObject<HTMLDivElement | null>;
  isConnected: boolean;
  error: string | null;
}

/**
 * Hook to manage a terminal instance connected to a daemon session.
 *
 * Creates an xterm.js terminal, attaches it to the daemon's PTY output stream,
 * and wires up bidirectional I/O (keystrokes -> daemon, output -> display).
 */
export function useTerminal(sessionId: string | null): UseTerminalResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<TerminalInstance | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId || !containerRef.current) return;

    const container = containerRef.current;
    let disposed = false;

    // Create the terminal.
    const instance = createTerminal(container);
    terminalRef.current = instance;
    const { terminal, fitAddon } = instance;

    // Wire up input: keystrokes -> daemon.
    const inputDisposable = terminal.onData((data: string) => {
      if (disposed) return;
      // Convert string to byte array.
      const encoder = new TextEncoder();
      const bytes = Array.from(encoder.encode(data));
      writeInput(sessionId, bytes).catch((err) => {
        console.error("Failed to write input:", err);
      });
    });

    // Wire up resize: terminal resize -> daemon.
    const resizeDisposable = terminal.onResize(
      ({ cols, rows }: { cols: number; rows: number }) => {
        if (disposed) return;
        resizeSession(sessionId, rows, cols).catch((err) => {
          console.error("Failed to resize session:", err);
        });
      },
    );

    // Attach to session output stream.
    const { promise } = attachSession(sessionId, (base64Data: string) => {
      if (disposed) return;
      try {
        // Decode base64 output from daemon.
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        terminal.write(bytes);
      } catch (err) {
        console.error("Failed to decode output:", err);
      }
    });

    setIsConnected(true);

    // Handle stream ending or errors.
    promise.catch((err) => {
      if (!disposed) {
        console.error("Session stream error:", err);
        setError(String(err));
        setIsConnected(false);
      }
    });

    // Send initial terminal size to daemon.
    const dims = fitAddon.proposeDimensions();
    if (dims) {
      resizeSession(sessionId, dims.rows, dims.cols).catch(() => {});
    }

    // Focus the terminal.
    terminal.focus();

    // Add click handler to refocus terminal when clicked.
    const handleClick = () => terminal.focus();
    container.addEventListener("click", handleClick);

    return () => {
      container.removeEventListener("click", handleClick);
      disposed = true;
      inputDisposable.dispose();
      resizeDisposable.dispose();
      instance.dispose();
      terminalRef.current = null;
      setIsConnected(false);
    };
  }, [sessionId]);

  return { containerRef, isConnected, error };
}
