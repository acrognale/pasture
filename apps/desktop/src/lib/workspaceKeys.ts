export const createWorkspaceKeys = (workspacePath: string) => ({
  workspace: () => ['workspace', workspacePath] as const,
  conversations: () => ['workspace', workspacePath, 'conversations'] as const,
  threads: () => ['workspace', workspacePath, 'threads'] as const,
  threadConversations: (threadId: string) =>
    ['workspace', workspacePath, 'thread', threadId, 'conversations'] as const,
  composer: (conversationId: string) =>
    [
      'workspace',
      workspacePath,
      'conversation',
      conversationId,
      'composer',
    ] as const,
  messageComments: (conversationId: string) =>
    [
      'workspace',
      workspacePath,
      'conversation',
      conversationId,
      'message-comments',
    ] as const,
  composerDefaults: () =>
    ['workspace', workspacePath, 'composer', 'defaults'] as const,
});

export type WorkspaceKeys = ReturnType<typeof createWorkspaceKeys>;
