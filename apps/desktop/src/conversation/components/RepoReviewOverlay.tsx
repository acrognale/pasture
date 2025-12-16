import type { GetRepoDiffParams } from '@pasture/protocol';
import { RepoReviewPane } from '~/review/RepoReviewPane';

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
    />
  );
}
