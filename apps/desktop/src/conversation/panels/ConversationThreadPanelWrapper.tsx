import { MessageCommentProvider } from '~/conversation/comments/MessageCommentContext';
import { MessageCommentDraftProvider } from '~/conversation/comments/MessageCommentDraftContext';
import { usePanelRuntime } from '~/panels/PanelRuntimeContext';
import type { PanelComponentProps } from '~/panels/types';

import { ConversationThreadPanel } from './ConversationThreadPanel';

export function ConversationThreadPanelWrapper(_props: PanelComponentProps) {
  const runtime = usePanelRuntime();
  const params = runtime.params as Parameters<
    typeof ConversationThreadPanel
  >[0];
  return (
    <MessageCommentProvider
      conversationId={params.conversationId}
      workspacePath={params.workspacePath}
    >
      <MessageCommentDraftProvider>
        <ConversationThreadPanel {...params} />
      </MessageCommentDraftProvider>
    </MessageCommentProvider>
  );
}
