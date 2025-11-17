/**
 * Hook for interrupting active conversation turns.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { Codex } from '~/codex/client';

export const useInterruptConversation = (conversationId: string | null) => {
  const [isPending, setIsPending] = useState(false);

  const interruptConversation = async () => {
    if (isPending || !conversationId) {
      return;
    }

    setIsPending(true);

    try {
      await Codex.interruptConversation({
        conversationId,
      });
      // Backend will emit turn_aborted event that updates the store
    } catch (error) {
      const description =
        error instanceof Error ? error.message : 'Please try again.';
      toast.error('Failed to interrupt conversation.', { description });
      throw error;
    } finally {
      setIsPending(false);
    }
  };

  return {
    interruptConversation,
    isPending,
  };
};
