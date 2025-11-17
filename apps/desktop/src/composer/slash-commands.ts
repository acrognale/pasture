import type { QueryClient } from '@tanstack/react-query';
import { Codex } from '~/codex/client';

export type SlashCommandInvocation = {
  name: string;
  args: string | null;
};

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
  run: (context: SlashCommandContext) => Promise<void>;
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
