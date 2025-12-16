import { useCallback, useEffect, useMemo } from 'react';

import { MessageCommentProvider } from '~/conversation/comments/MessageCommentContext';
import { MessageCommentDraftProvider } from '~/conversation/comments/MessageCommentDraftContext';
import { useNamedShortcut } from '~/keyboard/hooks';
import { dockLayoutHasAnyTabs } from '~/panels/layout';
import { HostLayout } from '~/panels/HostLayout';
import { usePanelManager } from '~/panels/PanelManagerProvider';
import type { DockLayoutNode, PanelInstanceId, PanelGroupId } from '~/panels/types';

import { ConversationPanelServicesProvider } from './panels/ConversationPanelServices';
import { registerConversationPanels } from './panels/register';

registerConversationPanels();

function findActiveInstanceIdInDockLayout(
  root: DockLayoutNode | null,
  focusedGroupId: PanelGroupId | null
): PanelInstanceId | null {
  if (!root) return null;
  if (root.type === 'group') {
    if (focusedGroupId && root.groupId !== focusedGroupId) return null;
    if (root.activeTabId) return root.activeTabId;
    return root.tabs[root.tabs.length - 1] ?? null;
  }
  for (const child of root.children) {
    const found = findActiveInstanceIdInDockLayout(child, focusedGroupId);
    if (found) return found;
  }
  if (focusedGroupId) {
    return findActiveInstanceIdInDockLayout(root, null);
  }
  return null;
}

type ConversationPaneProps = {
  workspacePath: string;
  conversationId: string;
  threadId?: string | null;
  onConversationForked?: (conversationId: string) => void;
};

function ConversationPaneContent({
  workspacePath,
  conversationId,
  threadId,
  onConversationForked,
}: ConversationPaneProps) {
  const hostId = useMemo(
    () => `conversation:${workspacePath}:${threadId ?? conversationId}`,
    [conversationId, threadId, workspacePath]
  );

  const host = usePanelManager((state) => state.hosts[hostId] ?? null);
  const actions = usePanelManager((state) => state.actions);

  useEffect(() => {
    actions.open(hostId, 'editor', 'conversation.thread', {
      workspacePath,
      conversationId,
      threadId,
      onConversationForked,
    });
  }, [actions, conversationId, hostId, onConversationForked, threadId, workspacePath]);

  const utilityRoot = host?.docks.utility.root ?? null;
  const utilityHasTabs = dockLayoutHasAnyTabs(utilityRoot);

  const closeReviewShortcutOverrides = useMemo(
    () => ({
      enabled: () => utilityHasTabs,
    }),
    [utilityHasTabs]
  );

  const handleCloseReviewShortcut = useCallback(() => {
    if (!utilityHasTabs) {
      return false;
    }
    const instanceId = findActiveInstanceIdInDockLayout(
      utilityRoot,
      host?.docks.utility.focusedGroupId ?? null
    );
    if (!instanceId) return false;
    actions.close(hostId, instanceId);
    return true;
  }, [actions, host?.docks.utility.focusedGroupId, hostId, utilityHasTabs, utilityRoot]);

  useNamedShortcut(
    'overlay.conversationReview.close',
    closeReviewShortcutOverrides,
    handleCloseReviewShortcut
  );

  return (
    <ConversationPanelServicesProvider>
      <div className="flex h-full flex-1 flex-col overflow-hidden relative">
        <div className="flex-1 min-h-0 flex overflow-hidden relative">
          <HostLayout hostId={hostId} responsiveRow />
        </div>
      </div>
    </ConversationPanelServicesProvider>
  );
}

export function ConversationPane(props: ConversationPaneProps) {
  const { conversationId, workspacePath } = props;

  return (
    <MessageCommentProvider
      conversationId={conversationId}
      workspacePath={workspacePath}
    >
      <MessageCommentDraftProvider>
        <ConversationPaneContent {...props} />
      </MessageCommentDraftProvider>
    </MessageCommentProvider>
  );
}
