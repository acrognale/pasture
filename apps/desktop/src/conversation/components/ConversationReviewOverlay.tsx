import { TurnReviewProvider } from '~/review/TurnReviewContext';
import { TurnReviewPane } from '~/review/TurnReviewPane';

import {
  useConversationLatestTurnDiff,
  useConversationTurnDiffHistory,
} from '../store/hooks';

export type ConversationReviewOverlayProps = {
  conversationId: string;
  workspacePath: string;
  open: boolean;
  onClose: () => void;
  onRequestFeedback: (prompt: string) => void;
  focusFilePath?: string | null;
  onFocusFilePathConsumed?: () => void;
};

export function ConversationReviewOverlay({
  conversationId,
  workspacePath,
  open,
  onClose,
  onRequestFeedback,
  focusFilePath,
  onFocusFilePathConsumed,
}: ConversationReviewOverlayProps) {
  const latestDiff = useConversationLatestTurnDiff(conversationId);
  const history = useConversationTurnDiffHistory(conversationId);

  return (
    <>
      {open ? (
        <TurnReviewProvider
          conversationId={conversationId}
          latestDiff={latestDiff}
          history={history}
        >
          <TurnReviewPane
            workspacePath={workspacePath}
            onRequestFeedback={onRequestFeedback}
            onClose={onClose}
            focusFilePath={focusFilePath}
            onFocusFilePathConsumed={onFocusFilePathConsumed}
            emptyStateMessage="No thread diffs recorded for this thread yet."
          />
        </TurnReviewProvider>
      ) : null}
    </>
  );
}
