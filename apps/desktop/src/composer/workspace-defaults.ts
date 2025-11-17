import type { AskForApproval } from '~/codex.gen/AskForApproval';
import type { ReasoningEffort } from '~/codex.gen/ReasoningEffort';
import type { ReasoningSummary } from '~/codex.gen/ReasoningSummary';
import type { SandboxMode } from '~/codex.gen/SandboxMode';
import type { WorkspaceComposerDefaults } from '~/codex.gen/WorkspaceComposerDefaults';

export type WorkspaceComposerDefaultsState = {
  model: string | null;
  reasoningEffort: ReasoningEffort | null;
  summary: ReasoningSummary | null;
  sandbox: SandboxMode | null;
  approval: AskForApproval | null;
};

export const emptyWorkspaceComposerDefaults: WorkspaceComposerDefaultsState = {
  model: null,
  reasoningEffort: null,
  summary: null,
  sandbox: null,
  approval: null,
};

export const normalizeWorkspaceComposerDefaults = (
  payload: WorkspaceComposerDefaults | null | undefined
): WorkspaceComposerDefaultsState => ({
  model: payload?.model ?? null,
  reasoningEffort: payload?.reasoningEffort ?? null,
  summary: payload?.reasoningSummary ?? null,
  sandbox: payload?.sandbox ?? null,
  approval: payload?.approval ?? null,
});
