import type { DockLayoutNode, PanelGroupId, PanelInstanceId } from './types';

export function findActiveInstanceIdInDockLayout(
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
