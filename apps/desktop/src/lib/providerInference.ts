export type ModelProviderId = 'anthropic' | 'openai';

export const normalizeModelProviderId = (
  value: string | null | undefined
): ModelProviderId | null => {
  const normalized = (value ?? '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'anthropic') return 'anthropic';
  if (normalized === 'openai') return 'openai';
  return null;
};

export const inferModelProviderId = (
  model: string | null | undefined
): ModelProviderId | null => {
  const normalized = (model ?? '').trim().toLowerCase();
  if (!normalized) return null;

  if (
    normalized.startsWith('claude-') ||
    normalized.startsWith('anthropic/claude-')
  ) {
    return 'anthropic';
  }

  if (normalized.startsWith('gpt-') || normalized.startsWith('codex-')) {
    return 'openai';
  }

  return null;
};

export const isAnthropicModel = (model: string | null | undefined): boolean =>
  inferModelProviderId(model) === 'anthropic';
