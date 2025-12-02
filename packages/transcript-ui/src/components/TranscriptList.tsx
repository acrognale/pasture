import { AnimatePresence, motion } from 'framer-motion';
import type { MotionProps } from 'framer-motion';
import { useMemo } from 'react';
import type { MutableRefObject, ReactNode } from 'react';

import type { TranscriptCell, TranscriptState, TranscriptTurn } from '../types';
import { cn } from '../lib/utils';

const isAgentOrStatus = (cell: TranscriptCell) =>
  cell.kind === 'agent-message' ||
  (cell.kind === 'status' && cell.statusType === 'turn-aborted');

const createRowMotionProps = (): Pick<
  MotionProps,
  'initial' | 'animate' | 'exit' | 'transition'
> => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 24 },
  transition: {
    opacity: { duration: 0.15 },
    y: { duration: 0.2, ease: 'easeOut' },
  },
});

export type TranscriptListRenderContext = {
  turnId: string;
  cellIndex: number;
  nthUserMessage?: number;
};

export type TranscriptListRenderCell = (
  cell: TranscriptCell,
  context: TranscriptListRenderContext
) => ReactNode;

type BaseTranscriptListProps = {
  className?: string;
  /**
   * Whether to enable collapsing of intermediate cells in completed turns.
   * When enabled, only the first cell (user message), last cell (agent message),
   * and the toggle are shown by default.
   */
  enableCollapsing?: boolean;
  /**
   * Record of turn IDs to their expanded state.
   * Only used when enableCollapsing is true.
   */
  expandedTurns?: Record<string, boolean>;
  /**
   * Callback when a turn's collapsed state is toggled.
   * Only used when enableCollapsing is true.
   */
  onToggleTurn?: (turnId: string) => void;
  /**
   * Custom renderer for a cell. Defaults to JSON output.
   */
  renderCell?: TranscriptListRenderCell;
  /**
   * Ref for the scrollable content container.
   */
  contentRef?: MutableRefObject<HTMLDivElement | null>;
  /**
   * Ref used for auto-scroll anchoring at the bottom.
   */
  bottomAnchorRef?: MutableRefObject<HTMLDivElement | null>;
  /**
   * Whether to animate the initial render (used when a transcript loads in-place).
   */
  shouldAnimateInitial?: boolean;
};

type TranscriptListWithTranscript = BaseTranscriptListProps & {
  transcript: TranscriptState;
  turns?: never;
  turnOrder?: never;
};

type TranscriptListWithTurns = BaseTranscriptListProps & {
  transcript?: never;
  turns: Record<string, TranscriptTurn>;
  turnOrder: string[];
};

export type TranscriptListProps =
  | TranscriptListWithTranscript
  | TranscriptListWithTurns;

type CollapsedTranscriptSectionProps = {
  hiddenCells: ReadonlyArray<TranscriptCell>;
  isExpanded: boolean;
  onToggle: () => void;
  turnId: string;
  renderCell: TranscriptListRenderCell;
  nthUserMessageMap: Record<string, number>;
};

const CollapsedTranscriptSection = ({
  hiddenCells,
  isExpanded,
  onToggle,
  turnId,
  renderCell,
  nthUserMessageMap,
}: CollapsedTranscriptSectionProps) => {
  const hiddenCount = hiddenCells.length;
  const collapseLabel = isExpanded
    ? `showing ${hiddenCount} ${hiddenCount === 1 ? 'message' : 'messages'}`
    : `${hiddenCount} ${hiddenCount === 1 ? 'message' : 'messages'} hidden`;

  return (
    <>
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            {hiddenCells.map((cell, idx) => (
              <div key={`${cell.id}-${idx}`}>
                {renderCell(cell, {
                  turnId,
                  cellIndex: idx + 1,
                  nthUserMessage:
                    cell.kind === 'user-message'
                      ? nthUserMessageMap[cell.id]
                      : undefined,
                })}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="my-2 flex items-center gap-2 text-muted-foreground">
        <div className="h-px flex-1 bg-border/80" />
        <button
          type="button"
          className="inline-flex items-center gap-2 px-3 py-1 text-transcript-micro font-medium rounded-md border border-transparent hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-expanded={isExpanded}
          onClick={onToggle}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn(
              'transition-transform',
              isExpanded ? 'rotate-180' : 'rotate-0'
            )}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
          <span>{collapseLabel}</span>
        </button>
        <div className="h-px flex-1 bg-border/80" />
      </div>
    </>
  );
};

type TranscriptTurnGroupProps = {
  turn: TranscriptTurn;
  turnId: string;
  enableCollapsing: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  renderCell: TranscriptListRenderCell;
  nthUserMessageMap: Record<string, number>;
};

const TranscriptTurnGroup = ({
  turn,
  turnId,
  enableCollapsing,
  isExpanded,
  onToggle,
  renderCell,
  nthUserMessageMap,
}: TranscriptTurnGroupProps) => {
  const cellsWithIndex = turn.cells.map((cell, idx) => ({ cell, idx }));

  if (!cellsWithIndex.length) {
    return null;
  }

  const renderAllCells = () => {
    const motionProps = createRowMotionProps();
    return cellsWithIndex.map(({ cell, idx }) => {
      const nthUserMessage =
        cell.kind === 'user-message' ? nthUserMessageMap[cell.id] : undefined;
      return (
        <motion.div key={`cell-${idx}`} {...motionProps}>
          {renderCell(cell, {
            turnId,
            cellIndex: idx,
            nthUserMessage,
          })}
        </motion.div>
      );
    });
  };

  const canCollapse = enableCollapsing && turn.status !== 'active';
  if (!canCollapse) {
    return renderAllCells();
  }

  let anchorIndex = -1;
  for (let i = cellsWithIndex.length - 1; i >= 1; i -= 1) {
    if (isAgentOrStatus(cellsWithIndex[i]?.cell)) {
      anchorIndex = i;
      break;
    }
  }

  if (anchorIndex === -1 && cellsWithIndex.length > 2) {
    anchorIndex = cellsWithIndex.length - 1;
  }

  const hiddenCells =
    anchorIndex > 1 ? cellsWithIndex.slice(1, anchorIndex) : [];

  if (hiddenCells.length > 0) {
    const firstCell = cellsWithIndex[0];
    if (!firstCell) {
      return null;
    }
    const anchorCell = cellsWithIndex[anchorIndex];
    const motionProps = createRowMotionProps();
    return (
      <>
        <motion.div key={`cell-${firstCell.idx}`} {...motionProps}>
          {renderCell(firstCell.cell, {
            turnId,
            cellIndex: firstCell.idx,
            nthUserMessage:
              firstCell.cell.kind === 'user-message'
                ? nthUserMessageMap[firstCell.cell.id]
                : undefined,
          })}
        </motion.div>
        <motion.div key={`${turnId}-collapsed-${anchorIndex}`} {...motionProps}>
          <CollapsedTranscriptSection
            hiddenCells={hiddenCells.map(({ cell }) => cell)}
            isExpanded={isExpanded}
            onToggle={onToggle}
            turnId={turnId}
            renderCell={renderCell}
            nthUserMessageMap={nthUserMessageMap}
          />
        </motion.div>
        {anchorCell && (
          <motion.div key={`cell-${anchorCell.idx}`} {...motionProps}>
            {renderCell(anchorCell.cell, {
              turnId,
              cellIndex: anchorCell.idx,
              nthUserMessage:
                anchorCell.cell.kind === 'user-message'
                  ? nthUserMessageMap[anchorCell.cell.id]
                  : undefined,
            })}
          </motion.div>
        )}
        {cellsWithIndex.slice(anchorIndex + 1).map(({ cell, idx }) => {
          const nthUserMessage =
            cell.kind === 'user-message'
              ? nthUserMessageMap[cell.id]
              : undefined;
          return (
            <motion.div key={`cell-${idx}`} {...motionProps}>
              {renderCell(cell, {
                turnId,
                cellIndex: idx,
                nthUserMessage,
              })}
            </motion.div>
          );
        })}
      </>
    );
  }

  return renderAllCells();
};

/**
 * Renders a list of transcript turns.
 * Supports optional collapsing of intermediate cells in completed turns.
 */
export function TranscriptList(props: TranscriptListProps) {
  const {
    className,
    enableCollapsing = true,
    expandedTurns = {},
    onToggleTurn,
    renderCell,
    contentRef,
    bottomAnchorRef,
    shouldAnimateInitial = false,
  } = props;

  const { turns, turnOrder } =
    'transcript' in props && props.transcript
      ? props.transcript
      : {
          turns: props.turns ?? {},
          turnOrder: props.turnOrder ?? [],
        };

  const effectiveTurns = turns;
  const effectiveTurnOrder = turnOrder;

  const nthUserMessageMap = useMemo(() => {
    const map: Record<string, number> = {};
    let nth = 0;
    effectiveTurnOrder.forEach((id) => {
      const turn = effectiveTurns[id];
      if (!turn) {
        return;
      }
      turn.cells.forEach((cell) => {
        if (cell.kind === 'user-message') {
          map[cell.id] = nth;
          nth += 1;
        }
      });
    });
    return map;
  }, [effectiveTurnOrder, effectiveTurns]);

  const renderCellWithFallback: TranscriptListRenderCell = (cell, ctx) => {
    if (renderCell) {
      return renderCell(cell, ctx);
    }
    return (
      <div className="text-transcript-muted-foreground text-xs leading-transcript whitespace-pre-wrap">
        {JSON.stringify(cell, null, 2)}
      </div>
    );
  };

  const turnEntries = effectiveTurnOrder
    .map((turnId) => {
      const turn = effectiveTurns[turnId];
      if (!turn || turn.cells.length === 0) {
        return null;
      }
      return { turnId, turn };
    })
    .filter((entry): entry is { turnId: string; turn: TranscriptTurn } =>
      Boolean(entry)
    );

  if (turnEntries.length === 0) {
    return (
      <div className="px-6 py-4 text-transcript-muted-foreground text-sm">
        No messages in this transcript.
      </div>
    );
  }

  return (
    <div ref={contentRef} className={className ?? 'px-6 pt-4 pb-4 select-text'}>
      <AnimatePresence initial={shouldAnimateInitial}>
        {turnEntries.map(({ turnId, turn }, index) => (
          <TranscriptTurnGroup
            key={`turn-${index}`}
            turnId={turnId}
            turn={turn}
            enableCollapsing={enableCollapsing}
            isExpanded={Boolean(expandedTurns[turnId])}
            onToggle={() => onToggleTurn?.(turnId)}
            renderCell={renderCellWithFallback}
            nthUserMessageMap={nthUserMessageMap}
          />
        ))}
      </AnimatePresence>
      <div ref={bottomAnchorRef} className="h-1" />
    </div>
  );
}
