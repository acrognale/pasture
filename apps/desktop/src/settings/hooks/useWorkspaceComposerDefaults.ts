import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { Codex } from '~/codex/client';
import {
  type WorkspaceComposerDefaultsState,
  normalizeWorkspaceComposerDefaults,
} from '~/composer/workspace-defaults';
import { createWorkspaceKeys } from '~/lib/workspaceKeys';

export function useWorkspaceComposerDefaults(workspacePath: string) {
  const queryClient = useQueryClient();
  const keys = useMemo(
    () => createWorkspaceKeys(workspacePath),
    [workspacePath]
  );

  const query = useQuery({
    queryKey: keys.composerDefaults(),
    queryFn: () =>
      Codex.getWorkspaceComposerDefaults({ workspacePath }).then(
        normalizeWorkspaceComposerDefaults
      ),
    staleTime: Infinity,
  });

  const mutation = useMutation({
    mutationFn: async (changes: Partial<WorkspaceComposerDefaultsState>) => {
      const payload = {
        workspacePath,
        model: changes.model ?? undefined,
        reasoningEffort: changes.reasoningEffort ?? undefined,
        reasoningSummary: changes.summary ?? undefined,
        sandbox: changes.sandbox ?? undefined,
        approval: changes.approval ?? undefined,
        webSearchEnabled: changes.webSearchEnabled ?? undefined,
      } as const;

      return Codex.updateWorkspaceSettings(payload).then(
        normalizeWorkspaceComposerDefaults
      );
    },
    onMutate: async (changes) => {
      await queryClient.cancelQueries({ queryKey: keys.composerDefaults() });
      const previous = queryClient.getQueryData<WorkspaceComposerDefaultsState>(
        keys.composerDefaults()
      );
      queryClient.setQueryData<WorkspaceComposerDefaultsState>(
        keys.composerDefaults(),
        (current) => ({
          ...(current ?? normalizeWorkspaceComposerDefaults(null)),
          ...changes,
        })
      );
      return { previous };
    },
    onError: (error, _changes, context) => {
      if (context?.previous) {
        queryClient.setQueryData(keys.composerDefaults(), context.previous);
      }
      const description =
        error instanceof Error ? error.message : 'Please try again.';
      toast.error('Failed to update settings.', { description });
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(keys.composerDefaults(), settings);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.composerDefaults() });
    },
  });

  const defaults =
    query.data ?? normalizeWorkspaceComposerDefaults(null);

  const disabled = query.isLoading || mutation.isPending;

  const updateSetting = (changes: Partial<WorkspaceComposerDefaultsState>) => {
    mutation.mutate(changes);
  };

  return {
    keys,
    defaults,
    query,
    mutation,
    disabled,
    updateSetting,
  };
}

