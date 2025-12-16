import { produce } from 'immer';
import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';

import {
  dockLayoutHasAnyTabs,
  normalizeSizes,
  pruneDockLayout,
  pruneHostLayout,
  setDockSplitSizes,
  setHostSplitSizes,
} from './layout';
import { getPanelKind } from './registry';
import type {
  DockId,
  DockLayoutNode,
  HostId,
  HostLayoutNode,
  PanelGroupId,
  PanelInstanceId,
  PanelKindId,
  SplitDirection,
  SplitId,
} from './types';

type PanelInstance = {
  instanceId: PanelInstanceId;
  kindId: PanelKindId;
  params: unknown;
  state: unknown;
};

type DockState = {
  root: DockLayoutNode | null;
  focusedGroupId: PanelGroupId | null;
};

export type HostState = {
  layoutRoot: HostLayoutNode;
  docks: Record<DockId, DockState>;
  instances: Record<PanelInstanceId, PanelInstance>;
  reveals: Record<PanelInstanceId, unknown>;
};

export type PanelManagerActions = {
  ensureHost: (hostId: HostId) => void;
  open: (
    hostId: HostId,
    dockId: DockId,
    kindId: PanelKindId,
    params: unknown,
    options?: { reveal?: unknown; dedupe?: boolean }
  ) => PanelInstanceId;
  close: (hostId: HostId, instanceId: PanelInstanceId) => void;
  focus: (hostId: HostId, instanceId: PanelInstanceId) => void;
  focusGroup: (hostId: HostId, dockId: DockId, groupId: PanelGroupId) => void;
  setReveal: (hostId: HostId, instanceId: PanelInstanceId, reveal: unknown) => void;
  consumeReveal: (hostId: HostId, instanceId: PanelInstanceId) => void;
  setInstanceState: (
    hostId: HostId,
    instanceId: PanelInstanceId,
    state: unknown
  ) => void;
  moveTabToGroup: (
    hostId: HostId,
    dockId: DockId,
    instanceId: PanelInstanceId,
    targetGroupId: PanelGroupId
  ) => void;
  splitGroup: (
    hostId: HostId,
    dockId: DockId,
    groupId: PanelGroupId,
    direction: SplitDirection,
    options?: { ratio?: number; move?: 'active' | 'all' | 'none' }
  ) => PanelGroupId;
  resizeDockSplit: (
    hostId: HostId,
    dockId: DockId,
    splitId: SplitId,
    sizes: number[]
  ) => void;
  resizeHostSplit: (hostId: HostId, splitId: SplitId, sizes: number[]) => void;
};

export type PanelManagerState = {
  hosts: Record<HostId, HostState>;
  actions: PanelManagerActions;
};

export type PanelManagerStore = StoreApi<PanelManagerState>;

const createEmptyDockState = (): DockState => ({ root: null, focusedGroupId: null });

const createEmptyHostState = (): HostState => ({
  layoutRoot: { type: 'dock', dockId: 'editor' },
  docks: {
    editor: createEmptyDockState(),
    utility: createEmptyDockState(),
  },
  instances: {},
  reveals: {},
});

const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

function hostLayoutHasDock(root: HostLayoutNode, dockId: DockId): boolean {
  if (root.type === 'dock') return root.dockId === dockId;
  return root.children.some((child) => hostLayoutHasDock(child, dockId));
}

function ensureDockInLayout(root: HostLayoutNode, dockId: DockId): HostLayoutNode {
  if (hostLayoutHasDock(root, dockId)) return root;
  return {
    type: 'split',
    splitId: newId('hostsplit'),
    direction: 'row',
    children: [{ type: 'dock', dockId }, root],
    sizes: normalizeSizes(2, [0.4, 0.6]),
  };
}

type GroupNode = Extract<DockLayoutNode, { type: 'group' }>;
type SplitNode = Extract<DockLayoutNode, { type: 'split' }>;

function findFirstGroup(root: DockLayoutNode): GroupNode | null {
  if (root.type === 'group') return root;
  for (const child of root.children) {
    const found = findFirstGroup(child);
    if (found) return found;
  }
  return null;
}

function findGroupById(root: DockLayoutNode, groupId: PanelGroupId): GroupNode | null {
  if (root.type === 'group') return root.groupId === groupId ? root : null;
  for (const child of root.children) {
    const found = findGroupById(child, groupId);
    if (found) return found;
  }
  return null;
}

function findGroupContainingInstance(
  root: DockLayoutNode,
  instanceId: PanelInstanceId
): GroupNode | null {
  if (root.type === 'group') {
    return root.tabs.includes(instanceId) ? root : null;
  }
  for (const child of root.children) {
    const found = findGroupContainingInstance(child, instanceId);
    if (found) return found;
  }
  return null;
}

function mapDockLayout(
  root: DockLayoutNode,
  mapGroup: (group: GroupNode) => GroupNode
): DockLayoutNode {
  if (root.type === 'group') return mapGroup(root);
  return { ...root, children: root.children.map((child) => mapDockLayout(child, mapGroup)) };
}

function replaceGroup(
  root: DockLayoutNode,
  groupId: PanelGroupId,
  replaceWith: (group: GroupNode) => DockLayoutNode
): DockLayoutNode {
  if (root.type === 'group') {
    return root.groupId === groupId ? replaceWith(root) : root;
  }
  return { ...root, children: root.children.map((child) => replaceGroup(child, groupId, replaceWith)) };
}

export const createPanelManagerStore = (): PanelManagerStore =>
  createStore<PanelManagerState>((set, get) => ({
    hosts: {},
    actions: {
      ensureHost: (hostId) => {
        const state = get();
        if (state.hosts[hostId]) {
          return;
        }
        set(
          produce<PanelManagerState>((draft) => {
            draft.hosts[hostId] = createEmptyHostState();
          })
        );
      },
      open: (hostId, dockId, kindId, params, options) => {
        const { actions } = get();
        actions.ensureHost(hostId);

        const state = get();
        const host = state.hosts[hostId];
        if (!host) {
          throw new Error(`Missing host: ${hostId}`);
        }

        const kind = getPanelKind(kindId);
        const dedupeKey = options?.dedupe !== false ? kind.dedupeKey?.(params) : null;

        if (dedupeKey) {
          const existing = Object.values(host.instances).find((instance) => {
            if (instance.kindId !== kindId) return false;
            const existingKey = kind.dedupeKey?.(instance.params);
            return existingKey === dedupeKey;
          });
          if (existing) {
            set(
              produce<PanelManagerState>((draft) => {
                const draftHost = draft.hosts[hostId];
                if (!draftHost) return;
                const draftInstance = draftHost.instances[existing.instanceId];
                if (!draftInstance) return;
                draftInstance.params = params;
              })
            );
            if (options?.reveal !== undefined) {
              actions.setReveal(hostId, existing.instanceId, options.reveal);
            }
            actions.focus(hostId, existing.instanceId);
            return existing.instanceId;
          }
        }

        const instanceId: PanelInstanceId = newId('instance');
        set(
          produce<PanelManagerState>((draft) => {
            const draftHost = draft.hosts[hostId] ?? createEmptyHostState();
            draft.hosts[hostId] = draftHost;

            draftHost.layoutRoot = ensureDockInLayout(draftHost.layoutRoot, dockId);

            const dock = draftHost.docks[dockId];
            if (!dock) {
              throw new Error(`Unknown dock: ${dockId}`);
            }

            if (!dock.root) {
              const groupId: PanelGroupId = newId('group');
              dock.root = {
                type: 'group',
                groupId,
                tabs: [instanceId],
                activeTabId: instanceId,
              };
              dock.focusedGroupId = groupId;
            } else if (dock.root.type === 'group') {
              dock.root.tabs.push(instanceId);
              dock.root.activeTabId = instanceId;
              dock.focusedGroupId = dock.root.groupId;
            } else {
              const focusedGroup =
                (dock.focusedGroupId
                  ? findGroupById(dock.root, dock.focusedGroupId)
                  : null) ?? findFirstGroup(dock.root);
              if (!focusedGroup) {
                throw new Error('Missing group in dock layout.');
              }
              dock.root = mapDockLayout(dock.root, (group) => {
                if (group.groupId !== focusedGroup.groupId) return group;
                return {
                  ...group,
                  tabs: [...group.tabs, instanceId],
                  activeTabId: instanceId,
                };
              });
              dock.focusedGroupId = focusedGroup.groupId;
            }

            draftHost.instances[instanceId] = {
              instanceId,
              kindId,
              params,
              state: null,
            };

            if (options?.reveal !== undefined) {
              draftHost.reveals[instanceId] = options.reveal;
            }
          })
        );

        return instanceId;
      },
      close: (hostId, instanceId) => {
        set(
          produce<PanelManagerState>((draft) => {
            const host = draft.hosts[hostId];
            if (!host) return;
            delete host.instances[instanceId];
            delete host.reveals[instanceId];

            for (const dockId of Object.keys(host.docks) as DockId[]) {
              const dock = host.docks[dockId];
              if (!dock.root) continue;

              dock.root = mapDockLayout(dock.root, (group) => {
                if (!group.tabs.includes(instanceId)) return group;
                const nextTabs = group.tabs.filter((id) => id !== instanceId);
                return {
                  ...group,
                  tabs: nextTabs,
                  activeTabId:
                    group.activeTabId === instanceId
                      ? nextTabs[nextTabs.length - 1] ?? null
                      : group.activeTabId,
                };
              });

              dock.root = pruneDockLayout(dock.root);
              const nextRoot = dock.root;
              if (!nextRoot || !dockLayoutHasAnyTabs(nextRoot)) {
                dock.root = null;
                dock.focusedGroupId = null;
                continue;
              }

              const focusedStillExists =
                dock.focusedGroupId && findGroupById(nextRoot, dock.focusedGroupId);
              if (!focusedStillExists) {
                dock.focusedGroupId = findFirstGroup(nextRoot)?.groupId ?? null;
              }
            }

            host.layoutRoot = pruneHostLayout(host.layoutRoot, {
              shouldKeepDock: (dockId) => {
                if (dockId === 'editor') return true;
                const dock = host.docks[dockId as DockId];
                return Boolean(dock?.root);
              },
            }) ?? { type: 'dock', dockId: 'editor' };
          })
        );
      },
      focus: (hostId, instanceId) => {
        set(
          produce<PanelManagerState>((draft) => {
            const host = draft.hosts[hostId];
            if (!host) return;
            for (const dockId of Object.keys(host.docks) as DockId[]) {
              const dock = host.docks[dockId];
              if (!dock.root) continue;

              const group = findGroupContainingInstance(dock.root, instanceId);
              if (!group) continue;

              dock.root = mapDockLayout(dock.root, (candidate) => {
                if (candidate.groupId !== group.groupId) return candidate;
                return { ...candidate, activeTabId: instanceId };
              });
              dock.focusedGroupId = group.groupId;
            }
          })
        );
      },
      focusGroup: (hostId, dockId, groupId) => {
        set(
          produce<PanelManagerState>((draft) => {
            const host = draft.hosts[hostId];
            if (!host) return;
            const dock = host.docks[dockId];
            if (!dock?.root) return;
            const group = findGroupById(dock.root, groupId);
            if (!group) return;
            dock.focusedGroupId = groupId;
          })
        );
      },
      setReveal: (hostId, instanceId, reveal) => {
        set(
          produce<PanelManagerState>((draft) => {
            const host = draft.hosts[hostId];
            if (!host) return;
            host.reveals[instanceId] = reveal;
          })
        );
      },
      consumeReveal: (hostId, instanceId) => {
        set(
          produce<PanelManagerState>((draft) => {
            const host = draft.hosts[hostId];
            if (!host) return;
            delete host.reveals[instanceId];
          })
        );
      },
      setInstanceState: (hostId, instanceId, state) => {
        set(
          produce<PanelManagerState>((draft) => {
            const host = draft.hosts[hostId];
            if (!host) return;
            const instance = host.instances[instanceId];
            if (!instance) return;
            instance.state = state;
          })
        );
      },
      moveTabToGroup: (hostId, dockId, instanceId, targetGroupId) => {
        set(
          produce<PanelManagerState>((draft) => {
            const host = draft.hosts[hostId];
            if (!host) return;
            const dock = host.docks[dockId];
            if (!dock?.root) return;

            const sourceGroup = findGroupContainingInstance(dock.root, instanceId);
            const targetGroup = findGroupById(dock.root, targetGroupId);
            if (!sourceGroup || !targetGroup) return;
            if (sourceGroup.groupId === targetGroupId) return;

            dock.root = mapDockLayout(dock.root, (group) => {
              if (group.groupId === sourceGroup.groupId) {
                const nextTabs = group.tabs.filter((id) => id !== instanceId);
                return {
                  ...group,
                  tabs: nextTabs,
                  activeTabId:
                    group.activeTabId === instanceId
                      ? nextTabs[nextTabs.length - 1] ?? null
                      : group.activeTabId,
                };
              }
              if (group.groupId === targetGroupId) {
                const nextTabs = [...group.tabs.filter((id) => id !== instanceId), instanceId];
                return { ...group, tabs: nextTabs, activeTabId: instanceId };
              }
              return group;
            });

            dock.root = pruneDockLayout(dock.root);
            const nextRoot = dock.root;
            if (!nextRoot || !dockLayoutHasAnyTabs(nextRoot)) {
              dock.root = null;
              dock.focusedGroupId = null;
              return;
            }

            dock.focusedGroupId = findGroupById(nextRoot, targetGroupId)
              ? targetGroupId
              : findFirstGroup(nextRoot)?.groupId ?? null;
          })
        );
      },
      splitGroup: (hostId, dockId, groupId, direction, options) => {
        const nextGroupId: PanelGroupId = newId('group');
        const splitId: SplitId = newId('split');
        set(
          produce<PanelManagerState>((draft) => {
            const host = draft.hosts[hostId];
            if (!host) return;
            const dock = host.docks[dockId];
            if (!dock?.root) return;

            const existing = findGroupById(dock.root, groupId);
            if (!existing) return;

            const move = options?.move ?? 'active';
            const ratio = options?.ratio ?? 0.5;
            const clampedRatio = Math.max(0.1, Math.min(ratio, 0.9));

            let leftGroup: GroupNode = existing;
            let rightGroup: GroupNode = {
              type: 'group',
              groupId: nextGroupId,
              tabs: [],
              activeTabId: null,
            };

            if (move === 'all') {
              rightGroup = {
                ...rightGroup,
                tabs: existing.tabs.slice(),
                activeTabId: existing.tabs[existing.tabs.length - 1] ?? null,
              };
              leftGroup = { ...existing, tabs: [], activeTabId: null };
            } else if (move === 'active') {
              const active = existing.activeTabId ?? existing.tabs[existing.tabs.length - 1] ?? null;
              if (active) {
                rightGroup = { ...rightGroup, tabs: [active], activeTabId: active };
                const remaining = existing.tabs.filter((id) => id !== active);
                leftGroup = {
                  ...existing,
                  tabs: remaining,
                  activeTabId: remaining[remaining.length - 1] ?? null,
                };
              }
            }

            const splitNode: SplitNode = {
              type: 'split',
              splitId,
              direction,
              children: [leftGroup, rightGroup],
              sizes: normalizeSizes(2, [1 - clampedRatio, clampedRatio]),
            };

            dock.root = replaceGroup(dock.root, groupId, () => splitNode);
            dock.root = pruneDockLayout(dock.root);
            dock.focusedGroupId = nextGroupId;
          })
        );
        return nextGroupId;
      },
      resizeDockSplit: (hostId, dockId, splitId, sizes) => {
        set(
          produce<PanelManagerState>((draft) => {
            const host = draft.hosts[hostId];
            if (!host) return;
            const dock = host.docks[dockId];
            if (!dock?.root) return;
            dock.root = setDockSplitSizes(dock.root, splitId, sizes, 0.08);
          })
        );
      },
      resizeHostSplit: (hostId, splitId, sizes) => {
        set(
          produce<PanelManagerState>((draft) => {
            const host = draft.hosts[hostId];
            if (!host) return;
            host.layoutRoot = setHostSplitSizes(host.layoutRoot, splitId, sizes, 0.08);
          })
        );
      },
    },
  }));
