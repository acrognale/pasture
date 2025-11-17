import type { ComposerTurnConfigPayload } from '~/codex.gen';

// Type alias for consistency with existing code
export type ComposerTurnConfig = ComposerTurnConfigPayload;

export type SlashCommandInvocation = {
  name: string;
  args: string | null;
};

export const createDefaultComposerConfig = (): ComposerTurnConfig => ({
  model: null,
  reasoningEffort: null,
  summary: null,
  sandbox: null,
  approval: null,
});
