export type ModelProviderId = 'anthropic' | 'openai';

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
