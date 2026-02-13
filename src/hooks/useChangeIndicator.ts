import { useState, useEffect, useCallback, useRef } from "react";
import { type DiffSummary, workspaceChanges } from "../lib/ipc";

interface UseChangeIndicatorReturn {
  insertions: number;
  deletions: number;
  files: DiffSummary["files"];
  isLoading: boolean;
  /** Force an immediate refresh. */
  refresh: () => void;
}

/**
 * Polls workspace changes for a session at regular intervals.
 * Returns current insertions/deletions counts and per-file breakdown.
 */
export function useChangeIndicator(
  sessionId: string | null,
  pollIntervalMs: number = 3000,
): UseChangeIndicatorReturn {
  const [insertions, setInsertions] = useState(0);
  const [deletions, setDeletions] = useState(0);
  const [files, setFiles] = useState<DiffSummary["files"]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchChanges = useCallback(async () => {
    if (!sessionId) return;
    setIsLoading(true);
    try {
      const diff = await workspaceChanges(sessionId);
      setInsertions(diff.total_insertions);
      setDeletions(diff.total_deletions);
      setFiles(diff.files);
    } catch {
      // Silently handle errors (session may not have a git repo yet).
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  // Fetch immediately and then poll.
  useEffect(() => {
    fetchChanges();

    intervalRef.current = setInterval(fetchChanges, pollIntervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchChanges, pollIntervalMs]);

  const refresh = useCallback(() => {
    fetchChanges();
  }, [fetchChanges]);

  return {
    insertions,
    deletions,
    files,
    isLoading,
    refresh,
  };
}
