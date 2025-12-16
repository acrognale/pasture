import { registerPanelKind } from '~/panels/registry';

import { ConversationReviewPanel } from './ConversationReviewPanel';
import { ConversationThreadPanelWrapper } from './ConversationThreadPanelWrapper';

export function registerConversationPanels() {
  registerPanelKind({
    kindId: 'conversation.thread',
    scope: 'conversation',
    title: () => 'Thread',
    dedupeKey: (params) => {
      const p = params as { threadId?: string | null; conversationId?: string };
      if (p.threadId) {
        return `thread:${p.threadId}`;
      }
      return p.conversationId ? `conversation:${p.conversationId}` : 'thread';
    },
    Component: ConversationThreadPanelWrapper,
  });

  registerPanelKind({
    kindId: 'conversation.review',
    scope: 'conversation',
    title: (params) => {
      const p = params as { mode?: 'turn' | 'repo' };
      return p.mode === 'repo' ? 'Review (Repo)' : 'Review';
    },
    dedupeKey: (params) => {
      const p = params as {
        mode?: 'turn' | 'repo';
        conversationId?: string;
        repoParams?: {
          workspacePath?: string;
          baseRef?: string;
          targetRef?: string | null;
          includeWorktree?: boolean;
        };
      };
      if (p.mode === 'repo' && p.repoParams) {
        return [
          'repo',
          p.conversationId ?? '',
          p.repoParams.workspacePath ?? '',
          p.repoParams.baseRef ?? '',
          p.repoParams.targetRef ?? '',
          p.repoParams.includeWorktree ? '1' : '0',
        ].join(':');
      }
      return `turn:${p.conversationId ?? ''}`;
    },
    Component: ConversationReviewPanel,
  });
}
