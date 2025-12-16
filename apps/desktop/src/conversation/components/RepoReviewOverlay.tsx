import type { GetRepoDiffParams } from '@pasture/protocol';
import { usePanelManagerStore } from '~/panels/PanelManagerProvider';
import { getConversationHostId } from '~/panels/host-ids';
import { RepoReviewPane } from '~/review/RepoReviewPane';
import { makeRepoConversationId } from '~/review/reviewKeys';

export type RepoReviewOverlayProps = {
  workspacePath: string;
  open: boolean;
  params: GetRepoDiffParams;
  onClose: () => void;
  onRequestFeedback: (prompt: string) => void;
  focusFilePath?: string | null;
  onFocusFilePathConsumed?: () => void;
};

export function RepoReviewOverlay({
  workspacePath,
  open,
  params,
  onClose,
  onRequestFeedback,
  focusFilePath,
  onFocusFilePathConsumed,
}: RepoReviewOverlayProps) {
  const panelManagerStore = usePanelManagerStore();
  const hostId = getConversationHostId(workspacePath);
  const conversationId = makeRepoConversationId(params);

  if (!open) {
    return null;
  }

  return (
    <RepoReviewPane
      workspacePath={workspacePath}
      params={params}
      onRequestFeedback={onRequestFeedback}
      onClose={onClose}
      focusFilePath={focusFilePath}
      onFocusFilePathConsumed={onFocusFilePathConsumed}
      onOpenFile={(request) => {
        if (request.mode !== 'repo') {
          return;
        }
        panelManagerStore.getState().actions.open(
          hostId,
          'editor',
          'conversation.reviewFile',
          {
            ...request,
            workspacePath,
            conversationId,
          },
          { dedupe: true }
        );
      }}
    />
  );
}
