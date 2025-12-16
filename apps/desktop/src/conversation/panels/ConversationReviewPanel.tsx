import type { GetRepoDiffParams } from '@pasture/protocol';
import type { ComponentProps } from 'react';
import { usePanelRuntime } from '~/panels/PanelRuntimeContext';
import { usePanelManagerStore } from '~/panels/PanelManagerProvider';
import { RepoReviewPane } from '~/review/RepoReviewPane';
import { TurnReviewProvider } from '~/review/TurnReviewContext';
import { TurnReviewPane } from '~/review/TurnReviewPane';

import {
  useConversationLatestTurnDiff,
  useConversationTurnDiffHistory,
} from '../store/hooks';
import { useConversationPanelServices } from './ConversationPanelServices';

export type ConversationReviewPanelParams =
  | {
      mode: 'turn';
      workspacePath: string;
      conversationId: string;
      threadTitle?: string | null;
    }
  | {
      mode: 'repo';
      workspacePath: string;
      conversationId: string;
      repoParams: GetRepoDiffParams;
      threadTitle?: string | null;
    };

type ReviewReveal = {
  focusFilePath?: string | null;
};

export function ConversationReviewPanel() {
  const runtime = usePanelRuntime();
  const panelManagerStore = usePanelManagerStore();
  const services = useConversationPanelServices();
  const params = runtime.params as ConversationReviewPanelParams;
  const reveal = (runtime.reveal as ReviewReveal | undefined) ?? undefined;

  const focusFilePath = reveal?.focusFilePath ?? null;

  const latestDiff = useConversationLatestTurnDiff(params.conversationId);
  const history = useConversationTurnDiffHistory(params.conversationId);

  type OpenFileRequest = Parameters<
    NonNullable<ComponentProps<typeof TurnReviewPane>['onOpenFile']>
  >[0];

  const handleOpenFile = (request: OpenFileRequest) => {
    const actions = panelManagerStore.getState().actions;

    if (request.mode === 'repo') {
      actions.open(
        runtime.hostId,
        'editor',
        'conversation.reviewFile',
        {
          mode: 'repo',
          workspacePath: params.workspacePath,
          repoParams: request.repoParams,
          reviewKey: request.reviewKey,
          filePath: request.file.displayPath,
          oldPath: request.file.oldPath,
          newPath: request.file.newPath,
          commentableLines: request.commentableLines,
        },
        { dedupe: true }
      );
      return;
    }

    actions.open(
      runtime.hostId,
      'editor',
      'conversation.reviewFile',
      {
        mode: 'turn',
        workspacePath: params.workspacePath,
        conversationId: params.conversationId,
        reviewKey: request.reviewKey,
        baseEventId: request.baseEventId,
        targetEventId: request.targetEventId,
        filePath: request.file.displayPath,
        oldPath: request.file.oldPath,
        newPath: request.file.newPath,
        commentableLines: request.commentableLines,
      },
      { dedupe: true }
    );
  };

  if (params.mode === 'repo') {
    return (
      <RepoReviewPane
        workspacePath={params.workspacePath}
        params={params.repoParams}
        onRequestFeedback={(prompt) => {
          services.insertFeedbackPrompt(prompt);
        }}
        onClose={runtime.close}
        focusFilePath={focusFilePath}
        onFocusFilePathConsumed={runtime.consumeReveal}
        headerSubtitle={params.threadTitle ?? null}
        onOpenFile={handleOpenFile}
      />
    );
  }

  return (
    <TurnReviewProvider
      conversationId={params.conversationId}
      latestDiff={latestDiff}
      history={history}
    >
      <TurnReviewPane
        workspacePath={params.workspacePath}
        onRequestFeedback={(prompt) => {
          services.insertFeedbackPrompt(prompt);
        }}
        onClose={runtime.close}
        focusFilePath={focusFilePath}
        onFocusFilePathConsumed={runtime.consumeReveal}
        emptyStateMessage="No thread diffs recorded for this thread yet."
        headerSubtitle={params.threadTitle ?? null}
        mode="turn"
        onOpenFile={handleOpenFile}
      />
    </TurnReviewProvider>
  );
}
