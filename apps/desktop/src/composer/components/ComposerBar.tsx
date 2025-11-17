import { ArrowUpIcon, SquareStopIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuthState } from '~/auth/useAuthState';
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import { useComposerConfig } from '~/composer/hooks/useComposerConfig';
import { useSlashCommands } from '~/composer/hooks/useSlashCommands';
import { useSendMessage } from '~/conversation/hooks/useSendMessage';
import {
  useConversationComposerLimits,
  useConversationIsRunning,
} from '~/conversation/store/hooks';

import {
  type ComposerTurnConfig,
  createDefaultComposerConfig,
} from '../config';
import { type SlashCommandInvocation } from '../types';
import { ModelConfigSelector } from './ModelConfigSelector';

export type ComposerBarControls = {
  focus: () => void;
  setDraft: (value: string) => void;
  appendDraft: (value: string) => void;
  getDraft: () => string;
};

export interface ComposerBarProps {
  workspacePath: string;
  conversationId: string | null;
  isTurnActive?: boolean;
  interruptPending?: boolean;
  stopButtonId?: string;
  onInterrupt: () => void;
  onScrollToBottom: () => void;
  focusInput?: boolean;
  onRequestFocus?: () => void;
  onComposerReady?: (controls: ComposerBarControls | null) => void;
}

const formatTokens = (value: number | null) => {
  if (value === null) {
    return '--';
  }

  if (value >= 1000) {
    const thousands = value / 1000;
    if (thousands >= 100) {
      return `${Math.round(thousands)}k`;
    }
    return `${thousands.toFixed(1).replace(/\.0$/, '')}k`;
  }

  return `${value}`;
};

const SLASH_NAME_PATTERN = /^[a-z0-9-]+$/i;

const parseSlashCommand = (input: string): SlashCommandInvocation | null => {
  if (!input.startsWith('/')) {
    return null;
  }

  const firstLine = input.split('\n', 1)[0] ?? '';
  const trimmed = firstLine.slice(1).trimStart();
  if (!trimmed) {
    return null;
  }

  const [rawName, ...rest] = trimmed.split(/\s+/);
  if (!rawName || !SLASH_NAME_PATTERN.test(rawName)) {
    return null;
  }

  const args = rest.length ? trimmed.slice(rawName.length).trim() : '';

  return {
    name: rawName.toLowerCase(),
    args: args.length > 0 ? args : null,
  };
};

export function ComposerBar({
  workspacePath,
  conversationId,
  isTurnActive: isTurnActiveProp,
  interruptPending: interruptPendingProp,
  stopButtonId,
  onInterrupt,
  onScrollToBottom,
  focusInput,
  onRequestFocus,
  onComposerReady,
}: ComposerBarProps) {
  const authState = useAuthState();
  const { query: composerQuery, updateComposer } = useComposerConfig(
    workspacePath,
    conversationId
  );
  const composerConfig = composerQuery.data ?? createDefaultComposerConfig();
  const composerLimits = useConversationComposerLimits(conversationId);
  const contextTokensInWindow = composerLimits.contextTokensInWindow ?? null;
  const maxContextTokens = composerLimits.maxContextWindow ?? null;

  const authDisabled =
    authState.isLoading || authState.data?.requiresAuth || false;
  const authDisabledReason = (() => {
    if (authState.isLoading) {
      return 'Authentication in progress...';
    }
    if (authState.data?.requiresAuth) {
      return 'Sign in with the Codex CLI to continue.';
    }
    return undefined;
  })();
  const disabled = authDisabled;
  const disabledReason = authDisabledReason;

  const { sendMessage: defaultSendMessage, mutation } = useSendMessage(
    workspacePath,
    conversationId
  );
  const isMutationPending = mutation.isPending;
  const slashCommands = useSlashCommands(workspacePath);
  const conversationIsRunning = useConversationIsRunning(conversationId);
  const isTurnActive = isTurnActiveProp ?? conversationIsRunning;
  const resolvedInterruptPending = interruptPendingProp ?? false;

  const [draft, setDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef(draft);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const pendingSlashCommand = useMemo(
    () => parseSlashCommand(draft.trim()),
    [draft]
  );

  const canSend = () => {
    if (disabled || isMutationPending) {
      return false;
    }
    if (isTurnActive) {
      return false;
    }

    return draft.trim().length > 0;
  };

  const handleComposerUpdate = useCallback(
    (updates: Partial<ComposerTurnConfig>) => {
      void updateComposer(updates);
    },
    [updateComposer]
  );

  const handleSlashCommand = useCallback(
    async (invocation: SlashCommandInvocation) => {
      if (!conversationId) {
        throw new Error('Conversation not available');
      }
      const command = slashCommands.resolve(invocation.name);
      if (!command) {
        const description = `Unknown slash command '/${invocation.name}'.`;
        toast.error('Command not found', { description });
        throw new Error(description);
      }

      if (isTurnActive && !command.availableDuringTurn) {
        slashCommands.notifyUnavailable(command);
        throw new Error(`'/${command.id}' unavailable while a turn is active`);
      }

      try {
        await slashCommands.execute({
          conversationId,
          invocation,
        });
      } catch (error) {
        slashCommands.notifyFailure(command, error);
        throw error;
      }
    },
    [conversationId, isTurnActive, slashCommands]
  );

  const submitDraft = () => {
    const text = draft.trim();
    if (!text) {
      return;
    }

    const slash = pendingSlashCommand;
    if (slash) {
      if (disabled || isMutationPending) {
        return;
      }

      setDraft('');
      onScrollToBottom();

      void handleSlashCommand(slash).catch(() => {
        setDraft(text);
      });

      return;
    }

    if (!canSend()) {
      return;
    }

    setDraft('');
    onScrollToBottom();

    void defaultSendMessage({ text }).catch(() => {
      setDraft(text);
    });
  };

  const focusComposer = useCallback(() => {
    textareaRef.current?.focus();
  }, []);
  const controls: ComposerBarControls = useMemo(
    () => ({
      focus: () => {
        focusComposer();
      },
      setDraft: (value: string) => {
        setDraft(value);
      },
      appendDraft: (value: string) => {
        setDraft((previous) => `${previous}${value}`);
      },
      getDraft: () => draftRef.current,
    }),
    [focusComposer]
  );

  useEffect(() => {
    if (focusInput) {
      focusComposer();
    }
    if (onRequestFocus) {
      onRequestFocus();
    }
  }, [focusInput, onRequestFocus, focusComposer]);

  useEffect(() => {
    const handler = onComposerReady;
    handler?.(controls);
    return () => {
      handler?.(null);
    };
  }, [onComposerReady, controls]);

  const handleComposerKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (event.key === 'Escape') {
      if (!isTurnActive) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      onInterrupt();
      return;
    }

    if (event.key === 'Enter' && event.metaKey) {
      event.preventDefault();
      event.stopPropagation();
      submitDraft();
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (disabled) {
      return;
    }

    if (isTurnActive) {
      onInterrupt();
      return;
    }

    submitDraft();
  };

  return (
    <form onSubmit={handleSubmit} className="pointer-events-auto">
      <div className="flex flex-col gap-3 p-3 relative bg-background border border-border rounded-lg">
        {disabled && disabledReason && (
          <div className="rounded-md bg-warning/10 px-3 py-2 text-xs font-medium text-warning-foreground">
            {disabledReason}
          </div>
        )}
        <div className="flex-1">
          <Textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={isMutationPending || disabled}
            onKeyDown={handleComposerKeyDown}
            rows={3}
            aria-busy={isMutationPending}
            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 resize-none p-0 bg-transparent"
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ModelConfigSelector
              conversationId={conversationId}
              composerConfig={composerConfig}
              disabled={isMutationPending || isTurnActive || disabled}
              onUpdate={handleComposerUpdate}
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="min-w-[72px] text-xs font-semibold text-muted-foreground text-right font-mono">
              {formatTokens(contextTokensInWindow)} /{' '}
              {formatTokens(maxContextTokens)}
            </span>
            {isTurnActive ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="rounded-full size-8 text-muted-foreground hover:text-foreground"
                aria-busy={resolvedInterruptPending}
                disabled={resolvedInterruptPending}
                id={stopButtonId}
                onClick={onInterrupt}
              >
                <SquareStopIcon className="size-4" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                variant="ghost"
                className="rounded-full size-8"
                disabled={isMutationPending || disabled || !draft.trim()}
                aria-busy={isMutationPending}
              >
                <ArrowUpIcon className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
