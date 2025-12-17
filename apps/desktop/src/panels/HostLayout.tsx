import type React from 'react';
import { Fragment, useCallback, useRef } from 'react';
import { cn } from '~/lib/utils';

import { PanelHost } from './PanelHost';
import { usePanelManager } from './PanelManagerProvider';
import { applyResizeDelta } from './layout';
import type { HostId, HostLayoutNode, SplitId } from './types';

export function HostLayout({
  hostId,
  responsiveRow,
}: {
  hostId: HostId;
  responsiveRow?: boolean;
}) {
  const host = usePanelManager((state) => state.hosts[hostId] ?? null);

  if (!host) {
    return null;
  }

  return (
    <HostLayoutNodeView
      hostId={hostId}
      node={host.layoutRoot}
      responsiveRow={Boolean(responsiveRow)}
    />
  );
}

function HostLayoutNodeView({
  hostId,
  node,
  responsiveRow,
}: {
  hostId: HostId;
  node: HostLayoutNode;
  responsiveRow: boolean;
}) {
  if (node.type === 'dock') {
    return <PanelHost hostId={hostId} dockId={node.dockId} />;
  }

  return (
    <HostSplitView hostId={hostId} node={node} responsiveRow={responsiveRow} />
  );
}

function HostSplitView({
  hostId,
  node,
  responsiveRow,
}: {
  hostId: HostId;
  node: Extract<HostLayoutNode, { type: 'split' }>;
  responsiveRow: boolean;
}) {
  const actions = usePanelManager((state) => state.actions);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const shouldUseRow = useCallback(() => {
    if (node.direction !== 'row') return false;
    if (!responsiveRow) return true;
    return window.matchMedia('(min-width: 1024px)').matches;
  }, [node.direction, responsiveRow]);

  const handleResizeStart = useCallback(
    (index: number, splitId: SplitId) =>
      (event: React.MouseEvent<HTMLDivElement>) => {
        event.preventDefault();

        const startSizes = node.sizes.slice();
        const startIsRow = shouldUseRow();
        const startPoint = startIsRow ? event.clientX : event.clientY;

        const handleMouseMove = (moveEvent: MouseEvent) => {
          const container = containerRef.current;
          if (!container) return;
          const rect = container.getBoundingClientRect();
          const axisSize = startIsRow ? rect.width : rect.height;
          if (!axisSize) return;

          const currentPoint = startIsRow
            ? moveEvent.clientX
            : moveEvent.clientY;
          const deltaRatio = (currentPoint - startPoint) / axisSize;
          const nextSizes = applyResizeDelta(startSizes, index, deltaRatio, {
            minRatio: 0.08,
          });
          actions.resizeHostSplit(hostId, splitId, nextSizes);
        };

        const handleMouseUp = () => {
          window.removeEventListener('mousemove', handleMouseMove);
          window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
      },
    [actions, hostId, node.sizes, shouldUseRow]
  );

  const isRow = shouldUseRow();

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex h-full w-full min-h-0 min-w-0 overflow-hidden',
        node.direction === 'row'
          ? responsiveRow
            ? 'flex-col lg:flex-row'
            : 'flex-row'
          : 'flex-col'
      )}
    >
      {node.children.map((child, index) => {
        const size = node.sizes[index] ?? 1 / node.children.length;
        const key = child.type === 'dock' ? child.dockId : child.splitId;
        return (
          <Fragment key={key}>
            <div
              className="flex min-h-0 min-w-0"
              style={{ flexGrow: size, flexBasis: 0 }}
            >
              <HostLayoutNodeView
                hostId={hostId}
                node={child}
                responsiveRow={responsiveRow}
              />
            </div>
            {index < node.children.length - 1 ? (
              <div
                className={cn(
                  'flex items-stretch justify-center bg-transparent',
                  isRow ? 'w-2 cursor-col-resize' : 'h-2 cursor-row-resize'
                )}
                onMouseDown={handleResizeStart(index, node.splitId)}
                role="separator"
                aria-orientation={isRow ? 'vertical' : 'horizontal'}
                aria-label="Resize dock split"
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
