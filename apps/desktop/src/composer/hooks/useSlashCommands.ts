import { useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { toast } from 'sonner';

import {
  type SlashCommandDefinition,
  type SlashCommandInvocation,
  findSlashCommand,
  listSlashCommands,
} from '../slash-commands';

type ExecuteOptions = {
  conversationId: string;
  invocation: SlashCommandInvocation;
};

export const useSlashCommands = (workspacePath: string) => {
  const queryClient = useQueryClient();

  const definitions = useMemo(() => listSlashCommands(), []);

  const resolve = (name: string): SlashCommandDefinition | undefined =>
    findSlashCommand(name);

  const execute = async ({
    conversationId,
    invocation,
  }: ExecuteOptions): Promise<void> => {
    const command = resolve(invocation.name);
    if (!command) {
      throw new Error(`Unknown slash command: /${invocation.name}`);
    }

    await command.run({
      conversationId,
      args: invocation.args,
      queryClient,
      workspacePath,
    });
  };

  const notifyUnavailable = (command: SlashCommandDefinition) => {
    toast.error(`'/${command.id}' is unavailable right now`, {
      description: 'Please wait for Codex to finish its current turn.',
    });
  };

  const notifyFailure = (command: SlashCommandDefinition, error: unknown) => {
    const message =
      error instanceof Error ? error.message : 'An unknown error occurred.';
    toast.error(`'/${command.id}' failed`, { description: message });
  };

  return {
    definitions,
    resolve,
    execute,
    notifyUnavailable,
    notifyFailure,
  };
};
