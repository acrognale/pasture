import type {
  DockId,
  DockLayoutNode,
  HostLayoutNode,
  SplitDirection,
  SplitId,
} from './types';

type SplitNode<TNode> = Extract<TNode, { type: 'split' }>;

const EPSILON = 1e-6;

export function normalizeSizes(
  childCount: number,
  sizes: number[] | undefined,
  options?: { minRatio?: number }
): number[] {
  if (childCount <= 0) return [];
  const minRatio = options?.minRatio ?? 0;
  const base =
    sizes && sizes.length === childCount
      ? sizes.map((value) => (Number.isFinite(value) ? value : 0))
      : Array.from({ length: childCount }, () => 1 / childCount);

  const clamped = minRatio
    ? base.map((value) => Math.max(minRatio, value))
    : base.slice();

  const sum = clamped.reduce((acc, value) => acc + value, 0);
  if (sum <= EPSILON) {
    return Array.from({ length: childCount }, () => 1 / childCount);
  }
  return clamped.map((value) => value / sum);
}

export function applyResizeDelta(
  sizes: number[],
  index: number,
  deltaRatio: number,
  options?: { minRatio?: number }
): number[] {
  const minRatio = options?.minRatio ?? 0.08;
  if (index < 0 || index >= sizes.length - 1) return sizes;

  const next = sizes.slice();
  const a = next[index] ?? 0;
  const b = next[index + 1] ?? 0;
  const total = a + b;
  if (total <= EPSILON) {
    return normalizeSizes(sizes.length, next, { minRatio });
  }

  const proposedA = a + deltaRatio;
  const clampedA = Math.max(minRatio, Math.min(proposedA, total - minRatio));
  next[index] = clampedA;
  next[index + 1] = total - clampedA;
  return normalizeSizes(next.length, next, { minRatio });
}

export function findDockSplitNode(
  root: DockLayoutNode | null,
  splitId: SplitId
): SplitNode<DockLayoutNode> | null {
  if (!root) return null;
  if (root.type === 'split') {
    if (root.splitId === splitId) return root;
    for (const child of root.children) {
      const found = findDockSplitNode(child, splitId);
      if (found) return found;
    }
  }
  return null;
}

export function findHostSplitNode(
  root: HostLayoutNode | null,
  splitId: SplitId
): SplitNode<HostLayoutNode> | null {
  if (!root) return null;
  if (root.type === 'split') {
    if (root.splitId === splitId) return root;
    for (const child of root.children) {
      const found = findHostSplitNode(child, splitId);
      if (found) return found;
    }
  }
  return null;
}

export function setDockSplitSizes(
  root: DockLayoutNode,
  splitId: SplitId,
  sizes: number[],
  minRatio?: number
): DockLayoutNode {
  if (root.type === 'split') {
    if (root.splitId === splitId) {
      return {
        ...root,
        sizes: normalizeSizes(root.children.length, sizes, { minRatio }),
      };
    }
    return { ...root, children: root.children.map((child) => setDockSplitSizes(child, splitId, sizes, minRatio)) };
  }
  return root;
}

export function setHostSplitSizes(
  root: HostLayoutNode,
  splitId: SplitId,
  sizes: number[],
  minRatio?: number
): HostLayoutNode {
  if (root.type === 'split') {
    if (root.splitId === splitId) {
      return {
        ...root,
        sizes: normalizeSizes(root.children.length, sizes, { minRatio }),
      };
    }
    return { ...root, children: root.children.map((child) => setHostSplitSizes(child, splitId, sizes, minRatio)) };
  }
  return root;
}

export function pruneDockLayout(
  root: DockLayoutNode | null
): DockLayoutNode | null {
  if (!root) return null;
  if (root.type === 'group') {
    if (root.tabs.length === 0) {
      return root.activeTabId === null ? root : { ...root, activeTabId: null };
    }
    if (!root.activeTabId || !root.tabs.includes(root.activeTabId)) {
      return { ...root, activeTabId: root.tabs[root.tabs.length - 1]! };
    }
    return root;
  }

  const prunedChildren = root.children
    .map(pruneDockLayout)
    .filter((child): child is DockLayoutNode => child !== null);
  if (prunedChildren.length === 0) return null;
  if (prunedChildren.length === 1) return prunedChildren[0]!;

  return {
    ...root,
    children: prunedChildren,
    sizes: normalizeSizes(prunedChildren.length, root.sizes),
  };
}

export function pruneHostLayout(
  root: HostLayoutNode | null,
  options: { shouldKeepDock: (dockId: string) => boolean }
): HostLayoutNode | null {
  if (!root) return null;
  if (root.type === 'dock') {
    return options.shouldKeepDock(root.dockId) ? root : null;
  }

  const prunedChildren = root.children
    .map((child) => pruneHostLayout(child, options))
    .filter((child): child is HostLayoutNode => child !== null);
  if (prunedChildren.length === 0) return null;
  if (prunedChildren.length === 1) return prunedChildren[0]!;

  return {
    ...root,
    children: prunedChildren,
    sizes: normalizeSizes(prunedChildren.length, root.sizes),
  };
}

export function dockLayoutHasAnyTabs(root: DockLayoutNode | null): boolean {
  if (!root) return false;
  if (root.type === 'group') return root.tabs.length > 0;
  return root.children.some((child) => dockLayoutHasAnyTabs(child));
}

export function createHostSplitRoot(options: {
  splitId: SplitId;
  direction: SplitDirection;
  primaryDockId: DockId;
  secondaryDockId: DockId;
  secondaryRatio: number;
}): HostLayoutNode {
  const secondaryRatio = Math.max(0.1, Math.min(options.secondaryRatio, 0.9));
  return {
    type: 'split',
    splitId: options.splitId,
    direction: options.direction,
    children: [
      { type: 'dock', dockId: options.secondaryDockId },
      { type: 'dock', dockId: options.primaryDockId },
    ],
    sizes: normalizeSizes(2, [secondaryRatio, 1 - secondaryRatio]),
  };
}
