export const createWorkspaceKeys = (workspacePath: string) => ({
  workspace: () => ['workspace', workspacePath] as const,
  conversations: () => ['workspace', workspacePath, 'conversations'] as const,
  composer: (conversationId: string) =>
    [
      'workspace',
      workspacePath,
      'conversation',
      conversationId,
      'composer',
    ] as const,
  composerDefaults: () =>
    ['workspace', workspacePath, 'composer', 'defaults'] as const,
});

export type WorkspaceKeys = ReturnType<typeof createWorkspaceKeys>;
