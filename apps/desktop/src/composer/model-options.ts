import type { ReasoningEffort } from '@pasture/protocol';

export type ModelName =
  | 'gpt-5.2'
  | 'gpt-5.1'
  | 'gpt-5.1-codex'
  | 'gpt-5.1-codex-max'
  | 'gpt-5.1-codex-mini'
  | 'claude-sonnet-4-5'
  | 'claude-opus-4-5'
  | 'claude-haiku-4-5';

export const MODEL_OPTIONS: readonly ModelName[] = [
  'gpt-5.1',
  'gpt-5.1-codex',
  'gpt-5.1-codex-max',
  'gpt-5.1-codex-mini',
  'gpt-5.2',
  'claude-sonnet-4-5',
  'claude-opus-4-5',
  'claude-haiku-4-5',
] as const;

export const MODEL_DISPLAY_NAMES: Record<ModelName, string> = {
  'gpt-5.1': 'GPT-5.1',
  'gpt-5.1-codex': 'GPT-5.1 Codex',
  'gpt-5.1-codex-max': 'GPT-5.1 Codex Max',
  'gpt-5.1-codex-mini': 'GPT-5.1 Codex Mini',
  'gpt-5.2': 'GPT-5.2',
  'claude-sonnet-4-5': 'Claude Sonnet 4.5',
  'claude-opus-4-5': 'Claude Opus 4.5',
  'claude-haiku-4-5': 'Claude Haiku 4.5',
};

const MODEL_REASONING_EFFORTS: Record<ModelName, ReasoningEffort[]> = {
  'gpt-5.1': ['low', 'medium', 'high'],
  'gpt-5.1-codex': ['low', 'medium', 'high'],
  'gpt-5.1-codex-max': ['low', 'medium', 'high', 'xhigh'],
  'gpt-5.1-codex-mini': ['medium', 'high'],
  'gpt-5.2': ['low', 'medium', 'high', 'xhigh'],
  'claude-sonnet-4-5': ['none', 'medium', 'high'],
  'claude-opus-4-5': ['none', 'medium', 'high'],
  'claude-haiku-4-5': ['none', 'medium', 'high'],
};

export const REASONING_EFFORT_OPTIONS: readonly ReasoningEffort[] = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
] as const;

export const getAvailableReasoningEfforts = (
  model: ModelName
): ReasoningEffort[] =>
  MODEL_REASONING_EFFORTS[model] ?? [...REASONING_EFFORT_OPTIONS];

export const normalizeReasoningEffort = (
  model: ModelName,
  candidate: ReasoningEffort | null | undefined
): ReasoningEffort => {
  const available = getAvailableReasoningEfforts(model);
  const fallback = available.includes('medium')
    ? 'medium'
    : (available[0] ?? 'medium');
  if (!candidate) return fallback;
  return available.includes(candidate) ? candidate : fallback;
};
