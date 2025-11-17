import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, test } from 'vitest';
import { useSlashCommands } from '~/composer/hooks/useSlashCommands';
import { mockCodex } from '~/testing/codex';
import { createTestQueryClient } from '~/testing/harness';

describe('useSlashCommands', () => {
  test("executes the '/compact' command via Codex", async () => {
    const queryClient = createTestQueryClient();

    const wrapper = ({ children }: { children?: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useSlashCommands('/tmp/workspace'), {
      wrapper,
    });

    await result.current.execute({
      conversationId: 'slash-command-conversation',
      invocation: { name: 'compact', args: null },
    });

    expect(mockCodex.stub.compactConversation).toHaveBeenCalledWith({
      conversationId: 'slash-command-conversation',
    });
  });
});
