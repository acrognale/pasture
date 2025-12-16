import type { GetRepoDiffParams } from '@pasture/protocol';
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
      repoParams: GetRepoDiffParams;
      reviewKey: string;
      filePath: string;
      oldPath: string | null;
      newPath: string | null;
      commentableLines: number[];
    };

export function ConversationReviewFilePanel() {
  const runtime = usePanelRuntime();
  const params = runtime.params as ConversationReviewFilePanelParams;

  return <ReviewFileDiffPane {...params} />;
}

