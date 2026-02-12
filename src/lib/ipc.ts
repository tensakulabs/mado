import { invoke } from "@tauri-apps/api/core";
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
}

// Tauri command wrappers.
export async function healthCheck(): Promise<DaemonStatus> {
  return invoke<DaemonStatus>("health_check");
}

export async function daemonStatus(): Promise<string> {
  return invoke<string>("daemon_status");
}

export async function reconnect(): Promise<string> {
  return invoke<string>("reconnect");
}

// Event listeners.
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
