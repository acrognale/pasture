import type { AskForApproval } from '~/codex.gen/AskForApproval';
import type { ReasoningEffort } from '~/codex.gen/ReasoningEffort';
import type { ReasoningSummary } from '~/codex.gen/ReasoningSummary';
import type { SandboxMode } from '~/codex.gen/SandboxMode';

const SANDBOX_VALUES: readonly SandboxMode[] = [
  'read-only',
  'workspace-write',
  'danger-full-access',
] as const;

export type ComposerTurnConfig = {
  model: string | null;
  reasoningEffort: ReasoningEffort | null;
  summary: ReasoningSummary | null;
  sandbox: SandboxMode | null;
  approval: AskForApproval | null;
};

export const createDefaultComposerConfig = (): ComposerTurnConfig => ({
  model: null,
  reasoningEffort: null,
  summary: null,
  sandbox: null,
  approval: null,
});

export const mergeComposerConfig = (
  current: ComposerTurnConfig,
  updates: Partial<ComposerTurnConfig>
): ComposerTurnConfig => ({
  model: updates.model ?? current.model ?? null,
  reasoningEffort: updates.reasoningEffort ?? current.reasoningEffort ?? null,
  summary: updates.summary ?? current.summary ?? null,
  sandbox: updates.sandbox ?? current.sandbox ?? null,
  approval: updates.approval ?? current.approval ?? null,
});

export const parseEnvironmentContextSandbox = (
  message: string
): SandboxMode | null => {
  const pattern = /<sandbox_mode>\s*([\s\S]*?)\s*<\/sandbox_mode>/i;
  const match = pattern.exec(message);
  if (!match) {
    return null;
  }
  const value = match[1].trim();
  return SANDBOX_VALUES.includes(value as SandboxMode)
    ? (value as SandboxMode)
    : null;
};
