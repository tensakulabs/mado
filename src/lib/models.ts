/**
 * LLM model limits and configuration.
 * Centralized constants for easy updates when model specs change.
 */

export interface ModelLimits {
  /** Maximum context window size in tokens */
  contextWindow: number;
  /** Maximum output tokens per response */
  maxOutput: number;
}

/**
 * Model limits by model ID.
 * These are the short IDs used by Claude CLI (sonnet, opus, haiku).
 */
export const MODEL_LIMITS: Record<string, ModelLimits> = {
  // Claude 4.5 models (current)
  sonnet: { contextWindow: 200_000, maxOutput: 16_000 },
  opus: { contextWindow: 200_000, maxOutput: 16_000 },
  haiku: { contextWindow: 200_000, maxOutput: 16_000 },

  // Aliases and full model IDs
  "claude-sonnet-4-5-20250929": { contextWindow: 200_000, maxOutput: 16_000 },
  "claude-opus-4-5": { contextWindow: 200_000, maxOutput: 16_000 },
  "claude-haiku-4-5": { contextWindow: 200_000, maxOutput: 16_000 },
};

/** Default limits when model is unknown */
export const DEFAULT_MODEL_LIMITS: ModelLimits = {
  contextWindow: 200_000,
  maxOutput: 16_000,
};

/**
 * Get limits for a model, falling back to defaults.
 */
export function getModelLimits(modelId: string): ModelLimits {
  return MODEL_LIMITS[modelId] ?? DEFAULT_MODEL_LIMITS;
}

/**
 * Get context window size for a model.
 */
export function getContextWindow(modelId: string): number {
  return getModelLimits(modelId).contextWindow;
}
