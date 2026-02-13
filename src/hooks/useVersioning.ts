import { useState, useCallback } from "react";
import {
  type Milestone,
  type DiffSummary,
  saveMilestone,
  listMilestones,
  diffMilestones,
  restoreMilestone,
} from "../lib/ipc";

interface UseVersioningReturn {
  milestones: Milestone[];
  isLoading: boolean;
  error: string | null;
  isSaving: boolean;

  /** Fetch milestones for a session. */
  fetchMilestones: (sessionId: string, limit?: number) => Promise<void>;

  /** Save a new milestone for a session. */
  save: (sessionId: string, message: string) => Promise<Milestone | null>;

  /** Get diff between two milestones. */
  getDiff: (
    sessionId: string,
    fromOid: string,
    toOid: string,
  ) => Promise<DiffSummary | null>;

  /** Restore to a specific milestone. */
  restore: (sessionId: string, oid: string) => Promise<boolean>;

  /** Clear the error state. */
  clearError: () => void;
}

/**
 * Hook for managing session versioning (milestones).
 * Provides save, list, diff, and restore operations.
 */
export function useVersioning(): UseVersioningReturn {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMilestones = useCallback(
    async (sessionId: string, limit?: number) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await listMilestones(sessionId, limit);
        setMilestones(result);
      } catch (err) {
        setError(String(err));
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const save = useCallback(
    async (sessionId: string, message: string): Promise<Milestone | null> => {
      setIsSaving(true);
      setError(null);
      try {
        const milestone = await saveMilestone(sessionId, message);
        // Prepend to the list since it's the most recent.
        setMilestones((prev) => [milestone, ...prev]);
        return milestone;
      } catch (err) {
        const errMsg = String(err);
        // "No changes to commit" is informational, not an error.
        if (errMsg.includes("No changes to commit")) {
          setError("No changes to save");
        } else {
          setError(errMsg);
        }
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [],
  );

  const getDiff = useCallback(
    async (
      sessionId: string,
      fromOid: string,
      toOid: string,
    ): Promise<DiffSummary | null> => {
      setError(null);
      try {
        return await diffMilestones(sessionId, fromOid, toOid);
      } catch (err) {
        setError(String(err));
        return null;
      }
    },
    [],
  );

  const restore = useCallback(
    async (sessionId: string, oid: string): Promise<boolean> => {
      setError(null);
      try {
        await restoreMilestone(sessionId, oid);
        return true;
      } catch (err) {
        setError(String(err));
        return false;
      }
    },
    [],
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    milestones,
    isLoading,
    error,
    isSaving,
    fetchMilestones,
    save,
    getDiff,
    restore,
    clearError,
  };
}
