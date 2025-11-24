import { vi } from 'vitest';

type NavigatePayload = {
  to: string;
  params?: {
    workspaceId?: string;
    threadId?: string | null;
  };
};

let activeThreadId: string | null = null;

export const setActiveConversationId = (threadId: string | null) => {
  activeThreadId = threadId;
};

export const getActiveConversationId = () => activeThreadId;

export const resetActiveConversationId = () => {
  activeThreadId = null;
};

export const mockNavigate = vi.fn<(payload: NavigatePayload) => Promise<void>>(
  async () => {}
);
