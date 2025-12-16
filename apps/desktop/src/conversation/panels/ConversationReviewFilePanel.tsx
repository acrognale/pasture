import type { GetRepoDiffParams } from '@pasture/protocol';
import { usePanelManagerStore } from '~/panels/PanelManagerProvider';
import { usePanelRuntime } from '~/panels/PanelRuntimeContext';
import { ReviewFileDiffPane } from '~/review/ReviewFileDiffPane';

export type ConversationReviewFilePanelParams =
  | {
      mode: 'turn';
      workspacePath: string;
      conversationId: string;
      reviewKey: string;
      baseEventId: string | null;
      targetEventId: string;
      filePath: string;
      oldPath: string | null;
      newPath: string | null;
      commentableLines: number[];
    }
  | {
      mode: 'repo';
      workspacePath: string;
      conversationId: string;
      repoParams: GetRepoDiffParams;
      reviewKey: string;
      filePath: string;
      oldPath: string | null;
      newPath: string | null;
      commentableLines: number[];
    };

type ReviewFileReveal = {
  lineNumber?: number;
  commentId?: string;
};

export function ConversationReviewFilePanel() {
  const runtime = usePanelRuntime();
  const panelManagerStore = usePanelManagerStore();
  const params = runtime.params as ConversationReviewFilePanelParams;
  const reveal = runtime.reveal as ReviewFileReveal | null;
  const lineNumber = typeof reveal?.lineNumber === 'number' ? reveal.lineNumber : null;

  return (
    <ReviewFileDiffPane
      {...params}
      reveal={lineNumber ? { lineNumber, commentId: reveal?.commentId } : null}
      onRevealHandled={() => {
        if (reveal) {
          runtime.consumeReveal();
        }
      }}
      onFirstCommentAdded={(reviewKey) => {
        const state = panelManagerStore.getState();
        const host = state.hosts[runtime.hostId];
        const actions = state.actions;

        const existing = Object.values(host?.instances ?? {}).find(
          (instance) =>
            instance.kindId === 'conversation.reviewComments' &&
            (instance.params as { mode?: string; conversationId?: string } | null)?.mode ===
              params.mode &&
            (instance.params as { conversationId?: string } | null)?.conversationId ===
              params.conversationId
        );

        const utilityRoot = host?.docks.utility.root;
        if (!existing && utilityRoot?.type === 'group') {
          actions.splitGroup(runtime.hostId, 'utility', utilityRoot.groupId, 'column', {
            move: 'none',
            ratio: 0.45,
          });
        }

        if (params.mode === 'repo') {
          actions.open(
            runtime.hostId,
            'utility',
            'conversation.reviewComments',
            {
              mode: 'repo',
              workspacePath: params.workspacePath,
              conversationId: params.conversationId,
              repoParams: params.repoParams,
              reviewKey,
            },
            { dedupe: true }
          );
          return;
        }

        actions.open(
          runtime.hostId,
          'utility',
          'conversation.reviewComments',
          {
            mode: 'turn',
            workspacePath: params.workspacePath,
            conversationId: params.conversationId,
            reviewKey,
          },
          { dedupe: true }
        );
      }}
    />
  );
}
