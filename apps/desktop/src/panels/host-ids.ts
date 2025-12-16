import type { HostId } from './types';

export function getConversationHostId(workspacePath: string): HostId {
  return `conversation:${workspacePath}`;
}

