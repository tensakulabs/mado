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
  message_count: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
}

export interface Milestone {
  oid: string;
  message: string;
  timestamp: string;
  files_changed: number;
  insertions: number;
  deletions: number;
}

export interface FileDiff {
  path: string;
  insertions: number;
  deletions: number;
  status: string;
}

export interface DiffSummary {
  files: FileDiff[];
  total_insertions: number;
  total_deletions: number;
}

export interface GitStatus {
  staged: FileDiff[];
  unstaged: FileDiff[];
}

// ── Chat mode types ──

export type MessageRole = "user" | "assistant" | "system";

export type ToolCallStatus = "running" | "completed" | "failed";

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
  output?: string;
  status: ToolCallStatus;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  tool_calls: ToolCall[];
  timestamp: string;
  usage?: TokenUsage;
  cost_usd?: number;
}

export type StreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_use_start"; tool_call_id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_call_id: string; output: string; is_error: boolean }
  | { type: "message_complete"; message: Message }
  | { type: "error"; message: string }
  | { type: "idle" };

// ── Daemon commands ──

export async function ping(): Promise<string> {
  return invoke<string>("ping");
}

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
  cwd?: string,
): Promise<Session> {
  return invoke<Session>("create_session", { name, model, rows, cols, cwd });
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

// ── API key commands ──

export async function hasApiKey(): Promise<boolean> {
  return invoke<boolean>("has_api_key");
}

export async function setApiKey(key: string): Promise<void> {
  return invoke<void>("set_api_key", { key });
}

export async function deleteApiKey(): Promise<void> {
  return invoke<void>("delete_api_key");
}

// ── Config commands ──

export interface UiConfig {
  theme: string;
  zoom_level: number;
  show_tool_calls: boolean;
  user_name?: string;
  ai_name?: string;
}

export interface MadoConfig {
  version: number;
  provider: string;
  auth_method: "cli" | "api_key";
  default_model: string;
  setup_complete: boolean;
  ui: UiConfig;
}

export async function getConfig(): Promise<MadoConfig> {
  return invoke<MadoConfig>("get_config");
}

export async function updateConfig(config: MadoConfig): Promise<void> {
  return invoke<void>("update_config", { config });
}

export async function completeSetup(): Promise<void> {
  return invoke<void>("complete_setup");
}

export async function isSetupComplete(): Promise<boolean> {
  return invoke<boolean>("is_setup_complete");
}

export async function checkCliAuth(): Promise<boolean> {
  return invoke<boolean>("check_cli_auth");
}

export async function checkCliInstalled(): Promise<string | null> {
  return invoke<string | null>("check_cli_installed");
}

export async function getUserDisplayName(): Promise<string> {
  return invoke<string>("get_user_display_name");
}

// ── Versioning commands ──

export async function saveMilestone(
  sessionId: string,
  message: string,
): Promise<Milestone> {
  return invoke<Milestone>("save_milestone", { sessionId, message });
}

export async function listMilestones(
  sessionId: string,
  limit?: number,
): Promise<Milestone[]> {
  return invoke<Milestone[]>("list_milestones", { sessionId, limit });
}

export async function diffMilestones(
  sessionId: string,
  fromOid: string,
  toOid: string,
): Promise<DiffSummary> {
  return invoke<DiffSummary>("diff_milestones", {
    sessionId,
    fromOid,
    toOid,
  });
}

export async function restoreMilestone(
  sessionId: string,
  oid: string,
): Promise<void> {
  return invoke<void>("restore_milestone", { sessionId, oid });
}

// ── Change indicator commands ──

export async function workspaceChanges(
  sessionId: string,
): Promise<DiffSummary> {
  return invoke<DiffSummary>("workspace_changes", { sessionId });
}

// ── Git commands ──

export async function gitStatus(sessionId: string): Promise<GitStatus> {
  return invoke<GitStatus>("git_status", { sessionId });
}

export async function gitFileDiff(
  sessionId: string,
  filePath: string,
  staged: boolean,
): Promise<string> {
  return invoke<string>("git_file_diff", { sessionId, filePath, staged });
}

export async function gitStageFile(
  sessionId: string,
  filePath: string,
): Promise<void> {
  return invoke<void>("git_stage_file", { sessionId, filePath });
}

export async function gitUnstageFile(
  sessionId: string,
  filePath: string,
): Promise<void> {
  return invoke<void>("git_unstage_file", { sessionId, filePath });
}

export async function gitStageFiles(
  sessionId: string,
  filePaths: string[],
): Promise<void> {
  return invoke<void>("git_stage_files", { sessionId, filePaths });
}

export async function gitUnstageFiles(
  sessionId: string,
  filePaths: string[],
): Promise<void> {
  return invoke<void>("git_unstage_files", { sessionId, filePaths });
}

export async function gitStageHunk(
  sessionId: string,
  filePath: string,
  hunkIndex: number,
): Promise<void> {
  return invoke<void>("git_stage_hunk", { sessionId, filePath, hunkIndex });
}

export async function gitCommit(
  sessionId: string,
  message: string,
): Promise<void> {
  return invoke<void>("git_commit", { sessionId, message });
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

// ── Chat mode commands ──

export async function sendMessage(
  sessionId: string,
  content: string,
  model?: string,
): Promise<string> {
  return invoke<string>("send_message", { sessionId, content, model });
}

export async function getMessages(
  sessionId: string,
  limit?: number,
  beforeId?: string,
): Promise<Message[]> {
  return invoke<Message[]>("get_messages", { sessionId, limit, beforeId });
}

export async function cancelResponse(sessionId: string): Promise<void> {
  return invoke<void>("cancel_response", { sessionId });
}

/**
 * Import Claude CLI history for a session's working directory.
 * Returns messages from Claude CLI sessions in that folder.
 */
export async function importHistory(
  sessionId: string,
  limit?: number,
  allSessions?: boolean,
): Promise<Message[]> {
  return invoke<Message[]>("import_history", { sessionId, limit, allSessions });
}

/**
 * Attach to a session's chat event stream via Tauri Channel.
 * The callback receives StreamEvent objects.
 * Returns a cleanup function to detach.
 */
export function attachChatSession(
  sessionId: string,
  onEvent: (event: StreamEvent) => void,
): { promise: Promise<void>; channel: Channel<StreamEvent> } {
  const channel = new Channel<StreamEvent>();
  channel.onmessage = onEvent;

  const promise = invoke<void>("attach_chat_session", {
    sessionId,
    onEvent: channel,
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
