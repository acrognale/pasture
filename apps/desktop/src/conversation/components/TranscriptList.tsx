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

  const renderAllCells = () => {
    const motionProps = createRowMotionProps();
    return cells.map((cell) => {
      return (
        <motion.div key={cell.id} {...motionProps}>
          <TranscriptCells cell={cell} />
        </motion.div>
      );
    });
  };

  const canCollapse = turn.status !== 'active';
  if (!canCollapse) {
    return renderAllCells();
  }

  // Find the "Anchor" cell (Agent message or Abort) which ends the collapsed section.
  // Everything between User Message (0) and Anchor is collapsible. We intentionally walk
  // backwards so that we anchor on the final agent message instead of any earlier replies.
  let anchorIndex = -1;
  for (let i = cells.length - 1; i >= 1; i -= 1) {
    if (isAgentOrStatus(cells[i])) {
      anchorIndex = i;
      break;
    }
  }

  // Fallback: if no agent message found, use the last cell as anchor if we have enough cells
  if (anchorIndex === -1 && cells.length > 2) {
    anchorIndex = cells.length - 1;
  }

  const hiddenCells = anchorIndex > 1 ? cells.slice(1, anchorIndex) : [];

  if (hiddenCells.length > 0) {
    const firstCell = cells[0];
    if (!firstCell) {
      return null;
    }
    const anchorCell = cells[anchorIndex];
    const motionProps = createRowMotionProps();
    return (
      <>
        <motion.div key={firstCell.id} {...motionProps}>
          <TranscriptCells cell={firstCell} />
        </motion.div>
        <motion.div key={`${turnId}-collapsed`} {...motionProps}>
          <CollapsedTranscriptSection
            hiddenCells={hiddenCells}
            isExpanded={isExpanded}
            onToggle={onToggle}
          />
        </motion.div>
        {anchorCell && (
          <motion.div key={anchorCell.id} {...motionProps}>
            <TranscriptCells cell={anchorCell} />
          </motion.div>
        )}
        {cells.slice(anchorIndex + 1).map((cell) => (
          <motion.div key={cell.id} {...motionProps}>
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
    .filter((entry): entry is { turnId: string; turn: TranscriptTurn } =>
      Boolean(entry)
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
