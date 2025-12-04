import type { AskForApproval } from '@pasture/protocol';
import type { ReasoningEffort } from '@pasture/protocol';
import type { ReasoningSummary } from '@pasture/protocol';
import type { SandboxMode } from '@pasture/protocol';
import type { WorkspaceSettings } from '@pasture/protocol';

export type WorkspaceComposerDefaultsState = {
  model: string | null;
  reasoningEffort: ReasoningEffort | null;
  summary: ReasoningSummary | null;
  sandbox: SandboxMode | null;
  approval: AskForApproval | null;
  webSearchEnabled: boolean | null;
};

export const emptyWorkspaceComposerDefaults: WorkspaceComposerDefaultsState = {
  model: null,
  reasoningEffort: null,
  summary: null,
  sandbox: null,
  approval: null,
  webSearchEnabled: null,
};

export const normalizeWorkspaceComposerDefaults = (
  payload: WorkspaceSettings | null | undefined
): WorkspaceComposerDefaultsState => ({
  model: payload?.model ?? null,
  reasoningEffort: payload?.reasoningEffort ?? null,
  summary: payload?.reasoningSummary ?? null,
  sandbox: payload?.sandbox ?? null,
  approval: payload?.approval ?? null,
  webSearchEnabled: payload?.webSearchEnabled ?? null,
});
