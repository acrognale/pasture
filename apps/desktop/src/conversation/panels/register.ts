import { registerPanelKind } from '~/panels/registry';

import { ConversationReviewPanel } from './ConversationReviewPanel';
import { ConversationReviewFilePanel } from './ConversationReviewFilePanel';
import { ConversationThreadPanelWrapper } from './ConversationThreadPanelWrapper';

export function registerConversationPanels() {
  registerPanelKind({
    kindId: 'conversation.thread',
    scope: 'conversation',
    title: (params) => {
      const p = params as { threadTitle?: string | null; threadId?: string | null };
      if (typeof p.threadTitle === 'string' && p.threadTitle.trim().length > 0) {
        return p.threadTitle;
      }
      return 'Untitled thread';
    },
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
      const p = params as {
        mode?: 'turn' | 'repo';
        threadTitle?: string | null;
        repoParams?: { includeWorktree?: boolean };
      };
      if (p.mode === 'repo') {
        const label = p.repoParams?.includeWorktree ? 'Working tree' : 'Branch';
        return `Review — ${label}`;
      }
      const title = typeof p.threadTitle === 'string' ? p.threadTitle.trim() : '';
      return `Review — ${title.length > 0 ? title : 'Untitled thread'}`;
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

  registerPanelKind({
    kindId: 'conversation.reviewFile',
    scope: 'conversation',
    title: (params) => {
      const p = params as { filePath?: string };
      const path = typeof p.filePath === 'string' ? p.filePath : 'File';
      return path.split('/').pop() ?? path;
    },
    dedupeKey: (params) => {
      const p = params as { reviewKey?: string; filePath?: string; mode?: string };
      return [p.mode ?? 'unknown', p.reviewKey ?? '', p.filePath ?? ''].join(':');
    },
    Component: ConversationReviewFilePanel,
  });
}
