import type { ComposerTurnConfig } from '~/composer/config';
import {
  mockCodexControls,
  useMockCodexStore,
} from '~/conversation/__stories__/mocks/state';

export const useComposerConfig = (
  _workspacePath: string,
  _conversationId: string | null | undefined
) => {
  const composerConfig = useMockCodexStore((state) => state.composerConfig);

  const updateComposer = (
    updates: Partial<ComposerTurnConfig>
  ): Promise<void> => {
    const nextConfig: ComposerTurnConfig = {
      ...composerConfig,
      ...updates,
    };
    mockCodexControls.setComposerConfig(nextConfig);
    return Promise.resolve();
  };

  return {
    query: {
      data: composerConfig,
      isLoading: false,
      isPending: false,
      isError: false,
      error: null,
    },
    updateComposer,
  };
};
