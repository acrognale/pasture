import type { GetRepoDiffParams } from '@pasture/protocol';
import { usePanelRuntime } from '~/panels/PanelRuntimeContext';
import { TurnReviewProvider } from '~/review/TurnReviewContext';
import { RepoReviewPane } from '~/review/RepoReviewPane';
import { TurnReviewPane } from '~/review/TurnReviewPane';

import { useConversationPanelServices } from './ConversationPanelServices';
import {
  useConversationLatestTurnDiff,
  useConversationTurnDiffHistory,
} from '../store/hooks';

export type ConversationReviewPanelParams =
  | {
      mode: 'turn';
      workspacePath: string;
      conversationId: string;
    }
  | {
      mode: 'repo';
      workspacePath: string;
      conversationId: string;
      repoParams: GetRepoDiffParams;
    };

type ReviewReveal = {
  focusFilePath?: string | null;
};

export function ConversationReviewPanel() {
  const runtime = usePanelRuntime();
  const services = useConversationPanelServices();
  const params = runtime.params as ConversationReviewPanelParams;
  const reveal = (runtime.reveal as ReviewReveal | undefined) ?? undefined;

  const focusFilePath = reveal?.focusFilePath ?? null;

  const latestDiff = useConversationLatestTurnDiff(params.conversationId);
  const history = useConversationTurnDiffHistory(params.conversationId);

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
      />
    </TurnReviewProvider>
  );
}
