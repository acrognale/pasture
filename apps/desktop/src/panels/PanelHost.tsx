import { XIcon } from 'lucide-react';
import type React from 'react';
import type { ReactNode } from 'react';
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { cn } from '~/lib/utils';

import { usePanelManager } from './PanelManagerProvider';
import { PanelRuntimeProvider } from './PanelRuntimeContext';
import { applyResizeDelta } from './layout';
import { getPanelKind } from './registry';
import type {
  DockId,
  DockLayoutNode,
  HostId,
  PanelGroupId,
  PanelInstanceId,
} from './types';

export function PanelHost({
  hostId,
  dockId,
  emptyState,
}: {
  hostId: HostId;
  dockId: DockId;
  emptyState?: ReactNode;
}) {
  const host = usePanelManager((state) => state.hosts[hostId] ?? null);
  const actions = usePanelManager((state) => state.actions);

  const dock = host?.docks[dockId] ?? null;
  const root = dock?.root ?? null;

  const getTabTitle = useCallback(
    (instanceId: PanelInstanceId) => {
      const instance = host?.instances[instanceId] ?? null;
      if (!instance) return 'Panel';
      const kind = getPanelKind(instance.kindId);
      return kind.title(instance.params, instance.state);
    },
    [host]
  );

  const tabDnD = useTabDragBetweenGroups({
    hostId,
    dockId,
    moveTabToGroup: actions.moveTabToGroup,
    getTabTitle,
  });

  if (!host || !root) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
        {emptyState ?? 'No panels'}
      </div>
    );
  }

  return (
    <div
      className="h-full w-full"
      data-panel-host-id={hostId}
      data-panel-dock-id={dockId}
    >
      <DockNodeView
        hostId={hostId}
        dockId={dockId}
        root={root}
        focusedGroupId={dock?.focusedGroupId ?? null}
        tabDnD={tabDnD}
      />
      {tabDnD.preview ? (
        <div
          className="pointer-events-none fixed left-0 top-0 z-50"
          style={{
            transform: `translate(${tabDnD.preview.x - tabDnD.preview.offsetX}px, ${tabDnD.preview.y - tabDnD.preview.offsetY}px)`,
          }}
          aria-hidden="true"
        >
          <div className="max-w-[320px] rounded-md bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md ring-1 ring-border/60">
            <span className="block truncate">{tabDnD.preview.title}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DockNodeView({
  hostId,
  dockId,
  root,
  focusedGroupId,
  tabDnD,
}: {
  hostId: HostId;
  dockId: DockId;
  root: DockLayoutNode;
  focusedGroupId: PanelGroupId | null;
  tabDnD: TabDnD;
}) {
  const host = usePanelManager((state) => state.hosts[hostId] ?? null);
  const actions = usePanelManager((state) => state.actions);

  if (!host) {
    return null;
  }

  if (root.type === 'group') {
    return (
      <GroupView
        hostId={hostId}
        dockId={dockId}
        group={root}
        isFocused={focusedGroupId === root.groupId}
        onFocusGroup={() => actions.focusGroup(hostId, dockId, root.groupId)}
        tabDnD={tabDnD}
      />
    );
  }

  return (
    <SplitView
      hostId={hostId}
      dockId={dockId}
      node={root}
      focusedGroupId={focusedGroupId}
      tabDnD={tabDnD}
    />
  );
}

function SplitView({
  hostId,
  dockId,
  node,
  focusedGroupId,
  tabDnD,
}: {
  hostId: HostId;
  dockId: DockId;
  node: Extract<DockLayoutNode, { type: 'split' }>;
  focusedGroupId: PanelGroupId | null;
  tabDnD: TabDnD;
}) {
  const actions = usePanelManager((state) => state.actions);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const isRow = node.direction === 'row';

  const handleResizeStart = useCallback(
    (index: number) => (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startPoint = isRow ? event.clientX : event.clientY;
      const startSizes = node.sizes.slice();

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const axisSize = isRow ? rect.width : rect.height;
        if (!axisSize) return;
        const currentPoint = isRow ? moveEvent.clientX : moveEvent.clientY;
        const deltaRatio = (currentPoint - startPoint) / axisSize;
        const nextSizes = applyResizeDelta(startSizes, index, deltaRatio, {
          minRatio: 0.08,
        });
        actions.resizeDockSplit(hostId, dockId, node.splitId, nextSizes);
      };

      const handleMouseUp = () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [actions, dockId, hostId, isRow, node.splitId, node.sizes]
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex h-full w-full min-h-0 min-w-0',
        isRow ? 'flex-row' : 'flex-col'
      )}
    >
      {node.children.map((child, index) => {
        const size = node.sizes[index] ?? 1 / node.children.length;
        const key = child.type === 'group' ? child.groupId : child.splitId;
        return (
          <Fragment key={key}>
            <div
              className="flex min-h-0 min-w-0"
              style={{ flexGrow: size, flexBasis: 0 }}
            >
              <DockNodeView
                hostId={hostId}
                dockId={dockId}
                root={child}
                focusedGroupId={focusedGroupId}
                tabDnD={tabDnD}
              />
            </div>
            {index < node.children.length - 1 ? (
              <div
                className={cn(
                  'flex items-stretch justify-center bg-transparent',
                  isRow ? 'w-2 cursor-col-resize' : 'h-2 cursor-row-resize'
                )}
                onMouseDown={handleResizeStart(index)}
                role="separator"
                aria-orientation={isRow ? 'vertical' : 'horizontal'}
                aria-label="Resize panel split"
              >
                <div
                  className={cn(
                    isRow ? 'h-full w-px' : 'h-px w-full',
                    'bg-border/60'
                  )}
                />
              </div>
            ) : null}
          </Fragment>
        );
      })}
    </div>
  );
}

function GroupView({
  hostId,
  dockId,
  group,
  isFocused,
  onFocusGroup,
  tabDnD,
}: {
  hostId: HostId;
  dockId: DockId;
  group: Extract<DockLayoutNode, { type: 'group' }>;
  isFocused: boolean;
  onFocusGroup: () => void;
  tabDnD: TabDnD;
}) {
  const host = usePanelManager((state) => state.hosts[hostId] ?? null);
  const actions = usePanelManager((state) => state.actions);

  if (!host) {
    return null;
  }

  const activeInstanceId = group.activeTabId;
  const activeInstance = activeInstanceId
    ? (host.instances[activeInstanceId] ?? null)
    : null;
  const activeKind = activeInstance
    ? getPanelKind(activeInstance.kindId)
    : null;
  const ActiveComponent = activeKind?.Component ?? null;

  return (
    <div
      className={cn(
        'flex h-full w-full min-w-0 flex-col',
        isFocused ? 'ring-1 ring-border/60' : null,
        tabDnD.isDropTarget(group.groupId) ? 'ring-2 ring-border/80' : null
      )}
      data-panel-group-dropzone={group.groupId}
      onMouseDown={onFocusGroup}
    >
      <div
        className={cn(
          'flex shrink-0 select-none items-center gap-1 border-b border-border/60 bg-background px-2 py-1',
          tabDnD.isDropTarget(group.groupId) ? 'bg-muted/40' : null
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {group.tabs.map((instanceId) => {
            const instance = host.instances[instanceId];
            if (!instance) {
              return null;
            }
            const kind = getPanelKind(instance.kindId);
            const title = kind.title(instance.params, instance.state);
            const isActive = instanceId === activeInstanceId;
            return (
              <button
                key={instanceId}
                type="button"
                className={cn(
                  'group flex min-w-0 items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors',
                  isActive
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  tabDnD.isDraggingTab(instanceId)
                    ? 'cursor-grabbing opacity-60'
                    : 'cursor-grab'
                )}
                onPointerDown={tabDnD.getTabPointerDownHandler(
                  instanceId,
                  group.groupId
                )}
                onClick={(event) => {
                  if (tabDnD.shouldSuppressTabClick()) {
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                  }
                  actions.focus(hostId, instanceId);
                }}
                title={title}
              >
                <span className="min-w-0 truncate">{title}</span>
                <span
                  className={cn(
                    'ml-1 inline-flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground',
                    isActive ? null : 'opacity-0 group-hover:opacity-100'
                  )}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    actions.close(hostId, instanceId);
                  }}
                  role="button"
                  aria-label={`Close ${title}`}
                >
                  <XIcon className="h-3 w-3" />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {activeInstance && activeKind && ActiveComponent ? (
          <PanelRuntimeProvider
            value={{
              hostId,
              dockId,
              instanceId: activeInstance.instanceId,
              params: activeInstance.params,
              state: activeInstance.state,
              setState: (state) =>
                actions.setInstanceState(
                  hostId,
                  activeInstance.instanceId,
                  state
                ),
              reveal: host.reveals[activeInstance.instanceId],
              consumeReveal: () =>
                actions.consumeReveal(hostId, activeInstance.instanceId),
              close: () => actions.close(hostId, activeInstance.instanceId),
            }}
          >
            <ActiveComponent instanceId={activeInstance.instanceId} />
          </PanelRuntimeProvider>
        ) : group.tabs.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
            No panels
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
            Missing panel.
          </div>
        )}
      </div>
    </div>
  );
}

type TabDnD = {
  isDraggingTab: (instanceId: PanelInstanceId) => boolean;
  isDropTarget: (groupId: PanelGroupId) => boolean;
  getTabPointerDownHandler: (
    instanceId: PanelInstanceId,
    fromGroupId: PanelGroupId
  ) => (event: React.PointerEvent<HTMLButtonElement>) => void;
  shouldSuppressTabClick: () => boolean;
  preview: {
    title: string;
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
  } | null;
};

function useTabDragBetweenGroups({
  hostId,
  dockId,
  moveTabToGroup,
  getTabTitle,
}: {
  hostId: HostId;
  dockId: DockId;
  moveTabToGroup: (
    hostId: HostId,
    dockId: DockId,
    instanceId: PanelInstanceId,
    targetGroupId: PanelGroupId
  ) => void;
  getTabTitle: (instanceId: PanelInstanceId) => string;
}): TabDnD {
  const [draggingTabId, setDraggingTabId] = useState<PanelInstanceId | null>(
    null
  );
  const [fromGroupId, setFromGroupId] = useState<PanelGroupId | null>(null);
  const [overGroupId, setOverGroupId] = useState<PanelGroupId | null>(null);
  const [preview, setPreview] = useState<TabDnD['preview']>(null);

  const dragCandidateRef = useRef<{
    instanceId: PanelInstanceId;
    fromGroupId: PanelGroupId;
    pointerId: number;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const suppressNextClickRef = useRef(false);
  const suppressResetTimerRef = useRef<number | null>(null);
  const lastOverGroupIdRef = useRef<PanelGroupId | null>(null);
  const cleanupListenersRef = useRef<(() => void) | null>(null);

  const clearDrag = useCallback(() => {
    if (suppressResetTimerRef.current !== null) {
      window.clearTimeout(suppressResetTimerRef.current);
      suppressResetTimerRef.current = null;
    }
    cleanupListenersRef.current?.();
    cleanupListenersRef.current = null;
    dragCandidateRef.current = null;
    setDraggingTabId(null);
    setFromGroupId(null);
    setOverGroupId(null);
    setPreview(null);
    lastOverGroupIdRef.current = null;
  }, []);

  useEffect(() => clearDrag, [clearDrag]);

  const getGroupIdAtPoint = useCallback(
    (x: number, y: number): PanelGroupId | null => {
      const element = document.elementFromPoint(x, y);
      const dropzone =
        element?.closest?.('[data-panel-group-dropzone]') ?? null;
      const groupId =
        dropzone?.getAttribute?.('data-panel-group-dropzone') ?? null;
      return groupId || null;
    },
    []
  );

  const updateOverGroup = useCallback(
    (x: number, y: number) => {
      const nextOver = getGroupIdAtPoint(x, y);
      if (nextOver === lastOverGroupIdRef.current) return;
      lastOverGroupIdRef.current = nextOver;
      setOverGroupId(nextOver);
    },
    [getGroupIdAtPoint]
  );

  const getTabPointerDownHandler = useCallback(
    (instanceId: PanelInstanceId, startGroupId: PanelGroupId) =>
      (event: React.PointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0) return;

        cleanupListenersRef.current?.();
        cleanupListenersRef.current = null;

        suppressNextClickRef.current = false;
        if (suppressResetTimerRef.current !== null) {
          window.clearTimeout(suppressResetTimerRef.current);
          suppressResetTimerRef.current = null;
        }

        const rect = event.currentTarget.getBoundingClientRect();
        dragCandidateRef.current = {
          instanceId,
          fromGroupId: startGroupId,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          offsetX: event.clientX - rect.left,
          offsetY: event.clientY - rect.top,
        };
        setDraggingTabId(null);
        setFromGroupId(startGroupId);
        updateOverGroup(event.clientX, event.clientY);

        const handlePointerMove = (moveEvent: PointerEvent) => {
          const candidate = dragCandidateRef.current;
          if (!candidate) return;
          if (moveEvent.pointerId !== candidate.pointerId) return;

          const dx = moveEvent.clientX - candidate.startX;
          const dy = moveEvent.clientY - candidate.startY;
          if (!suppressNextClickRef.current && Math.hypot(dx, dy) >= 4) {
            suppressNextClickRef.current = true;
            setDraggingTabId(candidate.instanceId);
            setFromGroupId(candidate.fromGroupId);
            setPreview({
              title: getTabTitle(candidate.instanceId),
              x: moveEvent.clientX,
              y: moveEvent.clientY,
              offsetX: candidate.offsetX,
              offsetY: candidate.offsetY,
            });
          } else if (suppressNextClickRef.current) {
            setPreview((current) =>
              current
                ? { ...current, x: moveEvent.clientX, y: moveEvent.clientY }
                : {
                    title: getTabTitle(candidate.instanceId),
                    x: moveEvent.clientX,
                    y: moveEvent.clientY,
                    offsetX: candidate.offsetX,
                    offsetY: candidate.offsetY,
                  }
            );
          }

          updateOverGroup(moveEvent.clientX, moveEvent.clientY);
        };

        const handlePointerEnd = (endEvent: PointerEvent) => {
          const candidate = dragCandidateRef.current;
          if (!candidate) return;
          if (endEvent.pointerId !== candidate.pointerId) return;

          const targetGroupId = getGroupIdAtPoint(
            endEvent.clientX,
            endEvent.clientY
          );
          const didDrag = suppressNextClickRef.current;
          const { fromGroupId: sourceGroupId } = candidate;
          clearDrag();

          if (didDrag) {
            suppressResetTimerRef.current = window.setTimeout(() => {
              suppressNextClickRef.current = false;
              suppressResetTimerRef.current = null;
            }, 250);
          }

          if (!didDrag || !targetGroupId || targetGroupId === sourceGroupId)
            return;
          moveTabToGroup(hostId, dockId, candidate.instanceId, targetGroupId);
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerEnd);
        window.addEventListener('pointercancel', handlePointerEnd);

        cleanupListenersRef.current = () => {
          window.removeEventListener('pointermove', handlePointerMove);
          window.removeEventListener('pointerup', handlePointerEnd);
          window.removeEventListener('pointercancel', handlePointerEnd);
        };
      },
    [
      clearDrag,
      dockId,
      getGroupIdAtPoint,
      getTabTitle,
      hostId,
      moveTabToGroup,
      updateOverGroup,
    ]
  );

  const shouldSuppressTabClick = useCallback(() => {
    if (!suppressNextClickRef.current) return false;
    suppressNextClickRef.current = false;
    if (suppressResetTimerRef.current !== null) {
      window.clearTimeout(suppressResetTimerRef.current);
      suppressResetTimerRef.current = null;
    }
    return true;
  }, []);

  return useMemo(
    () => ({
      isDraggingTab: (instanceId) => draggingTabId === instanceId,
      isDropTarget: (groupId) =>
        Boolean(
          draggingTabId &&
            fromGroupId &&
            groupId !== fromGroupId &&
            overGroupId === groupId
        ),
      getTabPointerDownHandler,
      shouldSuppressTabClick,
      preview,
    }),
    [
      draggingTabId,
      fromGroupId,
      getTabPointerDownHandler,
      overGroupId,
      preview,
      shouldSuppressTabClick,
    ]
  );
}
