import { invoke, Channel } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// Types matching kobo-core types.
export interface DaemonStatus {
  pid: number;
  uptime: number;
  session_count: number;
  version: string;
}

export interface Session {
  id: string;
  name: string;
  model: string;
  status: string;
  created_at: string;
  updated_at: string;
  working_dir?: string;
  command?: string;
  shell_fallback: boolean;
}

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
}

// ── Daemon commands ──

export async function healthCheck(): Promise<DaemonStatus> {
  return invoke<DaemonStatus>("health_check");
}

export async function daemonStatus(): Promise<string> {
  return invoke<string>("daemon_status");
}

export async function reconnect(): Promise<string> {
  return invoke<string>("reconnect");
}

// ── Session commands ──

export async function listSessions(): Promise<Session[]> {
  return invoke<Session[]>("list_sessions");
}

export async function createSession(
  name: string,
  model: string,
  rows: number,
  cols: number,
): Promise<Session> {
  return invoke<Session>("create_session", { name, model, rows, cols });
}

export async function destroySession(sessionId: string): Promise<void> {
  return invoke<void>("destroy_session", { sessionId });
}

export async function writeInput(
  sessionId: string,
  data: number[],
): Promise<void> {
  return invoke<void>("write_input", { sessionId, data });
}

export async function resizeSession(
  sessionId: string,
  rows: number,
  cols: number,
): Promise<void> {
  return invoke<void>("resize_session", { sessionId, rows, cols });
}

// ── Model commands ──

export async function listModels(): Promise<ModelInfo[]> {
  return invoke<ModelInfo[]>("list_models");
}

// ── SSE bridge ──

/**
 * Attach to a session's output stream via Tauri Channel.
 * The callback receives base64-encoded output data.
 * Returns a cleanup function to detach.
 */
export function attachSession(
  sessionId: string,
  onOutput: (base64Data: string) => void,
): { promise: Promise<void>; channel: Channel<string> } {
  const channel = new Channel<string>();
  channel.onmessage = onOutput;

  const promise = invoke<void>("attach_session", {
    sessionId,
    onOutput: channel,
  });

  return { promise, channel };
}

// ── Event listeners ──

export function onDaemonConnected(
  callback: (payload: string) => void,
): Promise<UnlistenFn> {
  return listen<string>("daemon-connected", (event) => {
    callback(event.payload);
  });
}

export function onDaemonError(
  callback: (payload: string) => void,
): Promise<UnlistenFn> {
  return listen<string>("daemon-error", (event) => {
    callback(event.payload);
  });
}
