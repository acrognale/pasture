import type { GetRepoDiffParams } from '@pasture/protocol';
import type { ComponentProps } from 'react';
import { useCallback } from 'react';
import { usePanelManagerStore } from '~/panels/PanelManagerProvider';
import { usePanelRuntime } from '~/panels/PanelRuntimeContext';
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

  const matchesRepoParams = useCallback(
    (candidate: unknown): candidate is GetRepoDiffParams => {
      if (!candidate || typeof candidate !== 'object') return false;
      const c = candidate as Partial<GetRepoDiffParams>;
      return (
        typeof c.workspacePath === 'string' &&
        typeof c.baseRef === 'string' &&
        typeof c.includeWorktree === 'boolean'
      );
    },
    []
  );

  const findCommentsPanelInstanceId = useCallback((): string | null => {
    const state = panelManagerStore.getState();
    const host = state.hosts[runtime.hostId];
    if (!host) return null;
    const instances = Object.values(host.instances);

    const match = instances.find((instance) => {
      if (instance.kindId !== 'conversation.reviewComments') return false;
      const p = instance.params as Record<string, unknown> | null;
      if (!p) return false;
      if (p.mode !== params.mode) return false;
      if (p.conversationId !== params.conversationId) return false;
      if (params.mode === 'repo') {
        const repoParams = p.repoParams;
        if (!matchesRepoParams(repoParams)) return false;
        return (
          repoParams.workspacePath === params.repoParams.workspacePath &&
          repoParams.baseRef === params.repoParams.baseRef &&
          (repoParams.targetRef ?? null) ===
            (params.repoParams.targetRef ?? null) &&
          repoParams.includeWorktree === params.repoParams.includeWorktree
        );
      }
      return true;
    });

    return match?.instanceId ?? null;
  }, [matchesRepoParams, panelManagerStore, params, runtime.hostId]);

  const handleReviewKeyChange = useCallback(
    (reviewKey: string | null) => {
      const instanceId = findCommentsPanelInstanceId();
      if (!instanceId) return;
      const actions = panelManagerStore.getState().actions;
      actions.setReveal(runtime.hostId, instanceId, { reviewKey });
    },
    [findCommentsPanelInstanceId, panelManagerStore, runtime.hostId]
  );

  const handleOpenComments = useCallback(
    (reviewKey: string) => {
      const state = panelManagerStore.getState();
      const host = state.hosts[runtime.hostId];
      const actions = state.actions;

      const existingId = findCommentsPanelInstanceId();

      const utilityRoot = host?.docks.utility.root;
      if (!existingId && utilityRoot?.type === 'group') {
        actions.splitGroup(
          runtime.hostId,
          'utility',
          utilityRoot.groupId,
          'column',
          {
            move: 'none',
            ratio: 0.45,
          }
        );
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
    },
    [findCommentsPanelInstanceId, panelManagerStore, params, runtime.hostId]
  );

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
          conversationId: params.conversationId,
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
        onOpenComments={handleOpenComments}
        onReviewKeyChange={handleReviewKeyChange}
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
        onOpenComments={handleOpenComments}
        onReviewKeyChange={handleReviewKeyChange}
      />
    </TurnReviewProvider>
  );
}
