import { AnimatePresence, motion } from 'framer-motion';
import type { MotionProps } from 'framer-motion';
import type { MutableRefObject } from 'react';
import type { TranscriptCell } from '~/conversation/transcript/types';
import type { TranscriptRenderable } from '~/conversation/transcript/view';

import { CollapsedTranscriptSection } from './CollapsedTranscriptSection';
import { TranscriptCells } from './TranscriptCells';

const buildEntryKey = (
  entry: TranscriptRenderable,
  cells: ReadonlyArray<TranscriptCell>
): string => {
  if (entry.type === 'cell') {
    const cellId = cells[entry.index]?.id ?? entry.index;
    return `cell-${cellId}`;
  }
  return `turn-${entry.turnId}`;
};

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
  cells: ReadonlyArray<TranscriptCell>;
  entries: TranscriptRenderable[];
  expandedTurns: Record<string, boolean>;
  onToggleTurn: (turnId: string) => void;
  bottomAnchorRef?: MutableRefObject<HTMLDivElement | null>;
  contentRef?: MutableRefObject<HTMLDivElement | null>;
};

export const TranscriptList = ({
  cells,
  entries,
  expandedTurns,
  onToggleTurn,
  bottomAnchorRef,
  contentRef,
}: TranscriptListProps) => {
  return (
    <div ref={contentRef} className="px-6 pt-4 pb-4">
      <AnimatePresence initial={false}>
        {entries.map((entry) => {
          const key = buildEntryKey(entry, cells);

          if (entry.type === 'cell') {
            const cell = cells[entry.index];
            if (!cell) {
              return null;
            }
            const motionProps = createRowMotionProps();
            return (
              <motion.div key={key} {...motionProps}>
                <TranscriptCells cell={cell} index={entry.index + 1} />
              </motion.div>
            );
          }

          const userCell = cells[entry.userIndex];
          const agentCell = cells[entry.finalAgentIndex];
          if (!userCell || !agentCell) {
            return null;
          }

          const collapsedMotion = createRowMotionProps();
          return (
            <motion.div key={key} {...collapsedMotion}>
              <CollapsedTranscriptSection
                turnId={entry.turnId}
                userIndex={entry.userIndex}
                finalAgentIndex={entry.finalAgentIndex}
                hiddenIndices={entry.hiddenIndices}
                cells={cells}
                isExpanded={Boolean(expandedTurns[entry.turnId])}
                onToggle={() => onToggleTurn(entry.turnId)}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
      <div ref={bottomAnchorRef} className="h-1" />
    </div>
  );
};
