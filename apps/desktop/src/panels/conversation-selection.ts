import { getConversationHostId } from './host-ids';
import { usePanelManager } from './PanelManagerProvider';
import type { HostId, DockLayoutNode, PanelGroupId } from './types';

function findActiveInstanceId(
  root: DockLayoutNode | null,
  focusedGroupId: PanelGroupId | null
): string | null {
  if (!root) return null;
  if (root.type === 'group') {
    if (focusedGroupId && root.groupId !== focusedGroupId) return null;
    return root.activeTabId ?? root.tabs[root.tabs.length - 1] ?? null;
  }
  for (const child of root.children) {
    const found = findActiveInstanceId(child, focusedGroupId);
    if (found) return found;
  }
  if (focusedGroupId) {
    return findActiveInstanceId(root, null);
  }
  return null;
}

export type ActiveConversationSelection = {
  hostId: HostId;
  threadId: string | null;
  conversationId: string | null;
};

export function useActiveConversationSelection(
  workspacePath: string
): ActiveConversationSelection {
  const hostId = getConversationHostId(workspacePath);
  const host = usePanelManager((state) => state.hosts[hostId] ?? null);

  const editorDock = host?.docks.editor ?? null;
  const activeInstanceId = findActiveInstanceId(
    editorDock?.root ?? null,
    editorDock?.focusedGroupId ?? null
  );
  const instance = activeInstanceId ? host?.instances[activeInstanceId] ?? null : null;
  const params =
    instance?.kindId === 'conversation.thread'
      ? (instance.params as { threadId?: unknown; conversationId?: unknown })
      : null;

  return {
    hostId,
    threadId: typeof params?.threadId === 'string' ? params.threadId : null,
    conversationId: typeof params?.conversationId === 'string' ? params.conversationId : null,
  };
}
