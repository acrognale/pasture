import { vi } from 'vitest';

type NavigatePayload = {
  to: string;
  params?: {
    workspaceId?: string;
    conversationId?: string | null;
  };
};

let activeConversationId: string | null = null;

export const setActiveConversationId = (conversationId: string | null) => {
  activeConversationId = conversationId;
};

export const getActiveConversationId = () => activeConversationId;

export const resetActiveConversationId = () => {
  activeConversationId = null;
};

export const mockNavigate = vi.fn<(payload: NavigatePayload) => Promise<void>>(
  async () => {}
);
