import type React from 'react';
import type { ReactNode } from 'react';
import { Fragment, useCallback, useRef } from 'react';
import { XIcon } from 'lucide-react';

import { cn } from '~/lib/utils';

import { applyResizeDelta } from './layout';
import { usePanelManager } from './PanelManagerProvider';
import { PanelRuntimeProvider } from './PanelRuntimeContext';
import { getPanelKind } from './registry';
import type { DockId, DockLayoutNode, HostId, PanelGroupId } from './types';

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

  const dock = host?.docks[dockId] ?? null;
  const root = dock?.root ?? null;

  if (!host || !root) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
        {emptyState ?? 'No panels'}
      </div>
    );
  }

  return (
    <DockNodeView
      hostId={hostId}
      dockId={dockId}
      root={root}
      focusedGroupId={dock?.focusedGroupId ?? null}
    />
  );
}

function DockNodeView({
  hostId,
  dockId,
  root,
  focusedGroupId,
}: {
  hostId: HostId;
  dockId: DockId;
  root: DockLayoutNode;
  focusedGroupId: PanelGroupId | null;
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
      />
    );
  }

  return (
    <SplitView
      hostId={hostId}
      dockId={dockId}
      node={root}
      focusedGroupId={focusedGroupId}
    />
  );
}

function SplitView({
  hostId,
  dockId,
  node,
  focusedGroupId,
}: {
  hostId: HostId;
  dockId: DockId;
  node: Extract<DockLayoutNode, { type: 'split' }>;
  focusedGroupId: PanelGroupId | null;
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
            <div className="flex min-h-0 min-w-0" style={{ flexGrow: size, flexBasis: 0 }}>
              <DockNodeView
                hostId={hostId}
                dockId={dockId}
                root={child}
                focusedGroupId={focusedGroupId}
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
                <div className={cn(isRow ? 'h-full w-px' : 'h-px w-full', 'bg-border/60')} />
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
}: {
  hostId: HostId;
  dockId: DockId;
  group: Extract<DockLayoutNode, { type: 'group' }>;
  isFocused: boolean;
  onFocusGroup: () => void;
}) {
  const host = usePanelManager((state) => state.hosts[hostId] ?? null);
  const actions = usePanelManager((state) => state.actions);

  if (!host) {
    return null;
  }

  const activeInstanceId = group.activeTabId;
  const activeInstance = activeInstanceId ? host.instances[activeInstanceId] ?? null : null;
  const activeKind = activeInstance ? getPanelKind(activeInstance.kindId) : null;
  const ActiveComponent = activeKind?.Component ?? null;

  return (
    <div
      className={cn(
        'flex h-full w-full min-w-0 flex-col',
        isFocused ? 'ring-1 ring-border/60' : null
      )}
      onMouseDown={onFocusGroup}
    >
      <div className="flex shrink-0 items-center gap-1 border-b border-border/60 bg-background px-2 py-1">
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
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                )}
                onClick={() => actions.focus(hostId, instanceId)}
                title={title}
              >
                <span className="min-w-0 truncate">{title}</span>
                <span
                  className={cn(
                    'ml-1 inline-flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground',
                    isActive ? null : 'opacity-0 group-hover:opacity-100'
                  )}
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
                actions.setInstanceState(hostId, activeInstance.instanceId, state),
              reveal: host.reveals[activeInstance.instanceId],
              consumeReveal: () => actions.consumeReveal(hostId, activeInstance.instanceId),
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
