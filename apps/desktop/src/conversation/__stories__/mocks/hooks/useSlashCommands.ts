import { useMemo } from 'react';
import {
  type SlashCommandDefinition,
  type SlashCommandInvocation,
  findSlashCommand,
  listSlashCommands,
} from '~/composer/slash-commands';

type ExecuteOptions = {
  conversationId: string;
  invocation: SlashCommandInvocation;
};

export const useSlashCommands = (_workspacePath: string) => {
  const definitions = useMemo(() => listSlashCommands(), []);

  const resolve = (name: string): SlashCommandDefinition | undefined =>
    findSlashCommand(name);

  const execute = ({ conversationId, invocation }: ExecuteOptions) => {
    console.info('[storybook] slash command', conversationId, invocation);
    return Promise.resolve();
  };

  const notifyUnavailable = (command: SlashCommandDefinition) => {
    console.warn(`[storybook] '/${command.id}' unavailable`);
  };

  const notifyFailure = (command: SlashCommandDefinition, error: unknown) => {
    console.error(`[storybook] '/${command.id}' failed`, error);
  };

  return {
    definitions,
    resolve,
    execute,
    notifyUnavailable,
    notifyFailure,
  };
};
