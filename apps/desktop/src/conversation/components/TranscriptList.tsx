import { AnimatePresence, motion } from 'framer-motion';
import type { MotionProps } from 'framer-motion';
import type { MutableRefObject } from 'react';
import type {
  TranscriptCell,
  TranscriptTurn,
} from '~/conversation/transcript/types';

import { CollapsedTranscriptSection } from './CollapsedTranscriptSection';
import { TranscriptCells } from './TranscriptCells';

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

type TranscriptListProps = {
  turns: Record<string, TranscriptTurn>;
  turnOrder: string[];
  expandedTurns: Record<string, boolean>;
  onToggleTurn: (turnId: string) => void;
  bottomAnchorRef?: MutableRefObject<HTMLDivElement | null>;
  contentRef?: MutableRefObject<HTMLDivElement | null>;
};

type TranscriptTurnProps = {
  turnId: string;
  turn: TranscriptTurn;
  isExpanded: boolean;
  onToggle: () => void;
};

const TranscriptTurnGroup = ({
  turnId,
  turn,
  isExpanded,
  onToggle,
}: TranscriptTurnProps) => {
  const { cells } = turn;
  if (!cells.length) {
    return null;
  }

  const renderAllCells = () => (
    <>
      {cells.map((cell, cellIndex) => {
        const motionProps = createRowMotionProps();
        const key = `${turnId}-cell-${cell.id ?? cellIndex}`;
        return (
          <motion.div key={key} {...motionProps}>
            <TranscriptCells cell={cell} />
          </motion.div>
        );
      })}
    </>
  );

  const canCollapse = turn.status !== 'active';
  if (!canCollapse) {
    return renderAllCells();
  }

  // Find the "Anchor" cell (Agent message or Abort) which ends the collapsed section.
  // Everything between User Message (0) and Anchor is collapsible.
  let anchorIndex = -1;
  for (let i = 1; i < cells.length; i++) {
    if (isAgentOrStatus(cells[i])) {
      anchorIndex = i;
      break;
    }
  }

  // Fallback: if no agent message found, use the last cell as anchor if we have enough cells
  if (anchorIndex === -1 && cells.length > 2) {
    anchorIndex = cells.length - 1;
  }

  const hiddenIndices: number[] = [];
  if (anchorIndex > 1) {
    for (let i = 1; i < anchorIndex; i++) {
      hiddenIndices.push(i);
    }
  }

  if (hiddenIndices.length > 0) {
    const firstCell = cells[0];
    if (!firstCell) {
      return null;
    }
    const motionProps = createRowMotionProps();
    return (
      <>
        <motion.div key={`${turnId}-cell-0`} {...motionProps}>
          <TranscriptCells cell={firstCell} />
        </motion.div>
        <motion.div key={`${turnId}-collapsed`} {...motionProps}>
          <CollapsedTranscriptSection
            turnId={turnId}
            hiddenIndices={hiddenIndices}
            finalCellIndex={anchorIndex}
            turnCells={cells}
            isExpanded={isExpanded}
            onToggle={onToggle}
          />
        </motion.div>
        {/* Render any cells that come after the anchor (e.g. Status events) */}
        {cells.slice(anchorIndex + 1).map((cell, i) => (
          <motion.div
            key={`${turnId}-cell-${cell.id ?? anchorIndex + 1 + i}`}
            {...motionProps}
          >
            <TranscriptCells cell={cell} />
          </motion.div>
        ))}
      </>
    );
  }

  return renderAllCells();
};

export const TranscriptList = ({
  turns,
  turnOrder,
  expandedTurns,
  onToggleTurn,
  bottomAnchorRef,
  contentRef,
}: TranscriptListProps) => {
  const turnEntries = turnOrder
    .map((turnId) => {
      const turn = turns[turnId];
      if (!turn || turn.cells.length === 0) {
        return null;
      }
      return { turnId, turn };
    })
    .filter(
      (entry): entry is { turnId: string; turn: TranscriptTurn } => Boolean(entry)
    );

  return (
    <div ref={contentRef} className="px-6 pt-4 pb-4">
      <AnimatePresence initial={false}>
        {turnEntries.map(({ turnId, turn }) => (
          <TranscriptTurnGroup
            key={`turn-${turnId}`}
            turnId={turnId}
            turn={turn}
            isExpanded={Boolean(expandedTurns[turnId])}
            onToggle={() => onToggleTurn(turnId)}
          />
        ))}
      </AnimatePresence>
      <div ref={bottomAnchorRef} className="h-1" />
    </div>
  );
};
