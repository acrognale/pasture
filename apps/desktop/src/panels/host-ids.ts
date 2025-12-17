import type { HostId } from './types';

export function getConversationHostId(workspacePath: string): HostId {
  return `conversation:${workspacePath}`;
}

export function getConversationThreadHostId(
  workspacePath: string,
  threadId: string
): HostId {
  return `conversation:${workspacePath}:thread:${threadId}`;
}
