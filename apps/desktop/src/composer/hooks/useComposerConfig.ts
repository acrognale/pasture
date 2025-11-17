import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { toast } from 'sonner';
import type { AskForApproval } from '~/codex.gen/AskForApproval';
import type { ComposerTurnConfigPayload } from '~/codex.gen/ComposerTurnConfigPayload';
import type { UpdateComposerConfigParams } from '~/codex.gen/UpdateComposerConfigParams';
import { Codex } from '~/codex/client';
import { createWorkspaceKeys } from '~/lib/workspaceKeys';

import {
  type ComposerTurnConfig,
  createDefaultComposerConfig,
  mergeComposerConfig,
} from '../config';
import {
  type WorkspaceComposerDefaultsState,
  emptyWorkspaceComposerDefaults,
} from '../workspace-defaults';

const toComposerConfig = (
  payload: ComposerTurnConfigPayload
): ComposerTurnConfig =>
  mergeComposerConfig(createDefaultComposerConfig(), {
    model: payload.model ?? null,
    reasoningEffort: payload.reasoningEffort ?? null,
    summary: payload.summary ?? null,
    sandbox: payload.sandbox ?? null,
    approval:
      (payload as { approval?: AskForApproval | null }).approval ?? null,
  });

type ExtendedUpdateComposerConfigParams = UpdateComposerConfigParams & {
  approval?: AskForApproval | null;
};

const createUpdatePayload = (
  workspacePath: string,
  conversationId: string,
  config: ComposerTurnConfig
): ExtendedUpdateComposerConfigParams => ({
  workspacePath,
  conversationId,
  model: config.model ?? null,
  reasoningEffort: config.reasoningEffort ?? null,
  summary: config.summary ?? null,
  sandbox: config.sandbox ?? null,
  approval: config.approval ?? null,
});

const loadComposerConfig = async (
  workspacePath: string,
  conversationId: string
): Promise<ComposerTurnConfig> => {
  try {
    const raw = await Codex.getComposerConfig({
      workspacePath,
      conversationId,
    });
    return toComposerConfig(raw);
  } catch (error) {
    console.warn(
      '[composer-config] Failed to fetch composer config, falling back to defaults',
      error
    );
    return createDefaultComposerConfig();
  }
};

export const useComposerConfig = (
  workspacePath: string,
  conversationId: string | null | undefined
) => {
  const queryClient = useQueryClient();
  const keys = useMemo(
    () => createWorkspaceKeys(workspacePath),
    [workspacePath]
  );

  const resolvedConversationId = conversationId ?? '__inactive__';
  const isEnabled = Boolean(workspacePath && conversationId);
  const queryKey = keys.composer(resolvedConversationId);

  const query = useQuery({
    queryKey,
    enabled: isEnabled,
    queryFn: () =>
      workspacePath && conversationId
        ? loadComposerConfig(workspacePath, resolvedConversationId)
        : createDefaultComposerConfig(),
    staleTime: Infinity,
    placeholderData: createDefaultComposerConfig,
  });

  const updateComposer = async (updates: Partial<ComposerTurnConfig>) => {
    if (!conversationId || !workspacePath) {
      return;
    }

    const cacheKey = keys.composer(conversationId);
    const current =
      queryClient.getQueryData<ComposerTurnConfig>(cacheKey) ??
      createDefaultComposerConfig();
    const next = mergeComposerConfig(current, updates);

    queryClient.setQueryData(cacheKey, next);

    const hasModelUpdate = Object.hasOwn(updates, 'model');
    const hasReasoningUpdate = Object.hasOwn(updates, 'reasoningEffort');
    const hasSummaryUpdate = Object.hasOwn(updates, 'summary');
    const hasSandboxUpdate = Object.hasOwn(updates, 'sandbox');
    const hasApprovalUpdate = Object.hasOwn(updates, 'approval');

    const defaultsKey = keys.composerDefaults();
    const existingDefaults =
      queryClient.getQueryData<WorkspaceComposerDefaultsState>(defaultsKey) ??
      emptyWorkspaceComposerDefaults;

    if (
      hasModelUpdate ||
      hasReasoningUpdate ||
      hasSummaryUpdate ||
      hasSandboxUpdate ||
      hasApprovalUpdate
    ) {
      const nextDefaults: WorkspaceComposerDefaultsState = {
        model: hasModelUpdate ? (next.model ?? null) : existingDefaults.model,
        reasoningEffort: hasReasoningUpdate
          ? (next.reasoningEffort ?? null)
          : existingDefaults.reasoningEffort,
        summary: hasSummaryUpdate
          ? (next.summary ?? null)
          : existingDefaults.summary,
        sandbox: hasSandboxUpdate
          ? (next.sandbox ?? null)
          : existingDefaults.sandbox,
        approval: hasApprovalUpdate
          ? (next.approval ?? null)
          : existingDefaults.approval,
      };

      queryClient.setQueryData(defaultsKey, nextDefaults);
    }

    const payload = createUpdatePayload(workspacePath, conversationId, next);
    try {
      await Codex.updateComposerConfig(payload);
    } catch (error) {
      // Revert optimistic update on error
      queryClient.setQueryData(cacheKey, current);
      if (
        hasModelUpdate ||
        hasReasoningUpdate ||
        hasSummaryUpdate ||
        hasSandboxUpdate ||
        hasApprovalUpdate
      ) {
        queryClient.setQueryData(defaultsKey, existingDefaults);
      }
      const description =
        error instanceof Error ? error.message : 'Please try again.';
      toast.error('Failed to update composer settings.', { description });
      throw error;
    }
  };

  return {
    query,
    updateComposer,
  };
};
