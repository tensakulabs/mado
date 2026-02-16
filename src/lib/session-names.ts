/**
 * localStorage-backed map of sessionId -> custom display name.
 * Falls back to the session's default name if no custom name is set.
 */

const STORAGE_KEY = "mado:session-names";

function loadMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

function saveMap(map: Record<string, string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // localStorage full or unavailable — silently ignore.
  }
}

/** Get the custom name for a session, or undefined if none is set. */
export function getSessionName(sessionId: string): string | undefined {
  const map = loadMap();
  return map[sessionId];
}

/** Set a custom name for a session. Pass empty string to clear. */
export function setSessionName(sessionId: string, name: string): void {
  const map = loadMap();
  const trimmed = name.trim();
  if (trimmed === "") {
    delete map[sessionId];
  } else {
    map[sessionId] = trimmed;
  }
  saveMap(map);
}

/** Remove the custom name for a session. */
export function removeSessionName(sessionId: string): void {
  const map = loadMap();
  delete map[sessionId];
  saveMap(map);
}

/** Get all custom session names (for deduplication checks). */
export function getAllSessionNames(): Record<string, string> {
  return loadMap();
}
