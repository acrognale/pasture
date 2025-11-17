/**
 * Hook for sending messages to conversations.
 * Handles optimistic updates via the conversation store.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { useAuthState } from '~/auth/useAuthState';
import type { AskForApproval } from '~/codex.gen/AskForApproval';
import type { InputItem } from '~/codex.gen/InputItem';
import type { ReasoningEffort } from '~/codex.gen/ReasoningEffort';
import type { ReasoningSummary } from '~/codex.gen/ReasoningSummary';
import type { SandboxMode } from '~/codex.gen/SandboxMode';
import type { SendUserMessageParams } from '~/codex.gen/SendUserMessageParams';
import { Codex } from '~/codex/client';
import {
  type ComposerTurnConfig,
  createDefaultComposerConfig,
} from '~/composer/config';
import { useComposerConfig } from '~/composer/hooks/useComposerConfig';

export type SendMessageVariables = {
  text: string;
  turnConfig?: TurnConfigOverrides;
};

export type TurnConfigOverrides = {
  model?: string;
  reasoningEffort?: ReasoningEffort;
  summary?: ReasoningSummary;
  sandbox?: SandboxMode;
  approval?: AskForApproval;
};

const createSendUserMessagePayload = (
  conversationId: string,
  items: InputItem[],
  baseConfig: ComposerTurnConfig,
  overrides?: TurnConfigOverrides
): SendUserMessageParams => {
  const resolvedModel = overrides?.model ?? baseConfig.model ?? null;
  const resolvedReasoning =
    overrides?.reasoningEffort ?? baseConfig.reasoningEffort ?? null;
  const resolvedSummary = overrides?.summary ?? baseConfig.summary ?? null;
  const resolvedSandbox = overrides?.sandbox ?? baseConfig.sandbox ?? null;
  const resolvedApproval = overrides?.approval ?? baseConfig.approval ?? null;

  const payload: SendUserMessageParams = {
    conversationId,
    items,
    model: resolvedModel,
    reasoningEffort: resolvedReasoning,
    summary: resolvedSummary,
    sandbox: resolvedSandbox,
    approvalPolicy: resolvedApproval,
  };

  return payload;
};

export const useSendMessage = (
  workspacePath: string,
  conversationId: string | null | undefined
) => {
  const authState = useAuthState();
  const [isPending, setIsPending] = useState(false);
  const { query: composerQuery } = useComposerConfig(
    workspacePath,
    conversationId
  );
  const composerConfig = composerQuery.data ?? createDefaultComposerConfig();

  const sendMessage = async (variables: SendMessageVariables) => {
    const trimmed = variables.text.trim();
    if (!trimmed) {
      return;
    }
    if (authState.isLoading || authState.data?.requiresAuth) {
      throw new Error('Authentication required');
    }

    if (!conversationId) {
      throw new Error('Conversation not available');
    }
    const { turnConfig } = variables;

    setIsPending(true);

    try {
      // Build payload
      const items: InputItem[] = [
        {
          type: 'text',
          data: { text: trimmed },
        },
      ];

      const payload = createSendUserMessagePayload(
        conversationId,
        items,
        composerConfig,
        turnConfig
      );

      console.log('[useSendMessage] Sending message to backend', {
        conversationId,
        trimmed,
      });

      // Send to backend
      await Codex.sendUserMessage(payload);

      console.log('[useSendMessage] Message sent successfully');

      // Backend will emit events that update the store
      // No need to do anything else on success
    } catch (error) {
      const description =
        error instanceof Error ? error.message : 'Please try again.';
      toast.error('Failed to send message.', { description });

      // Re-throw so component can handle error
      throw error;
    } finally {
      setIsPending(false);
    }
  };

  return {
    sendMessage,
    sendMessageAsync: sendMessage,
    mutation: {
      isPending,
      mutate: (vars: SendMessageVariables) => {
        void sendMessage(vars);
      },
      mutateAsync: sendMessage,
    },
  };
};
