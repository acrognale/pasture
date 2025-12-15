import type { QueryClient } from '@tanstack/react-query';
import type { ReviewTarget } from '@pasture/protocol';
import { Codex } from '~/codex/client';

export type SlashCommandInvocation = {
  name: string;
  args: string | null;
};

export type HandoffCommandResult = {
  type: 'handoff';
  threadId: string;
  conversationId: string;
  composerDraft: string;
  goal: string | null;
  title: string | null;
};

export type SlashCommandResult = HandoffCommandResult | { type: 'noop' };

type SlashCommandContext = {
  conversationId: string;
  args: string | null;
  queryClient: QueryClient;
  workspacePath: string;
};

export type SlashCommandDefinition = {
  id: string;
  label: string;
  description: string;
  availableDuringTurn: boolean;
  run: (context: SlashCommandContext) => Promise<SlashCommandResult | void>;
};

const COMMANDS: readonly SlashCommandDefinition[] = [
  {
    id: 'compact',
    label: 'Compact conversation',
    description: 'Summarize the current conversation to free up context window',
    availableDuringTurn: false,
    run: async ({ conversationId }) => {
      // NOTE: Status updates now come from backend events via ConversationStoreProvider
      await Codex.compactConversation({ conversationId });
      return { type: 'noop' as const };
    },
  },
  {
    id: 'review-map',
    label: 'Review map',
    description: 'Generate a structured review map (concept graph + reading order)',
    availableDuringTurn: false,
    run: async ({ conversationId, args }) => {
      const target: ReviewTarget =
        args && args.trim().length > 0
          ? { type: 'custom', instructions: args.trim() }
          : { type: 'uncommittedChanges' };

      await Codex.reviewMapConversation({
        conversationId,
        target,
      });

      return { type: 'noop' as const };
    },
  },
  {
    id: 'handoff',
    label: 'Handoff to new thread',
    description:
      'Start a new focused thread using this conversation as context',
    availableDuringTurn: false,
    run: async ({ conversationId, args }) => {
      const goal = args && args.trim().length > 0 ? args.trim() : null;

      const {
        threadId,
        conversationId: newConversationId,
        composerDraft,
        title,
      } = await Codex.handoffConversation({
        conversationId,
        goal,
      });

      // Future: title may be used for optimistic UI.
      void title;

      return {
        type: 'handoff' as const,
        threadId,
        conversationId: newConversationId,
        composerDraft,
        goal,
        title: title ?? null,
      };
    },
  },
] as const;

const COMMAND_LOOKUP = new Map(
  COMMANDS.map((command) => [command.id, command])
);

export const listSlashCommands = () => COMMANDS;

export const findSlashCommand = (name: string) =>
  COMMAND_LOOKUP.get(normalizeSlashCommandName(name));

export const normalizeSlashCommandName = (value: string) =>
  value.trim().toLowerCase();
