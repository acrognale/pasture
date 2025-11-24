import { AnimatePresence, motion } from 'framer-motion';
import type { MotionProps } from 'framer-motion';
import { useMemo } from 'react';
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
  conversationId: string;
  turns: Record<string, TranscriptTurn>;
  turnOrder: string[];
  expandedTurns: Record<string, boolean>;
  onToggleTurn: (turnId: string) => void;
  onConversationForked?: (conversationId: string) => void;
  bottomAnchorRef?: MutableRefObject<HTMLDivElement | null>;
  contentRef?: MutableRefObject<HTMLDivElement | null>;
};

type TranscriptTurnProps = {
  turnId: string;
  turn: TranscriptTurn;
  isExpanded: boolean;
  onToggle: () => void;
  conversationId: string;
  nthUserMessageMap: Record<string, number>;
  onConversationForked?: (conversationId: string) => void;
};

const TranscriptTurnGroup = ({
  turnId,
  turn,
  isExpanded,
  onToggle,
  conversationId,
  nthUserMessageMap,
  onConversationForked,
}: TranscriptTurnProps) => {
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
          <TranscriptCells
            cell={cell}
            conversationId={conversationId}
            nthUserMessage={nthUserMessage}
            onConversationForked={onConversationForked}
          />
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
  for (let i = cellsWithIndex.length - 1; i >= 1; i -= 1) {
    if (isAgentOrStatus(cellsWithIndex[i]?.cell)) {
      anchorIndex = i;
      break;
    }
  }

  // Fallback: if no agent message found, use the last cell as anchor if we have enough cells
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
          <TranscriptCells
            cell={firstCell.cell}
            conversationId={conversationId}
            nthUserMessage={
              firstCell.cell.kind === 'user-message'
                ? nthUserMessageMap[firstCell.cell.id]
                : undefined
            }
            onConversationForked={onConversationForked}
          />
        </motion.div>
        <motion.div key={`${turnId}-collapsed-${anchorIndex}`} {...motionProps}>
          <CollapsedTranscriptSection
            hiddenCells={hiddenCells.map(({ cell }) => cell)}
            isExpanded={isExpanded}
            onToggle={onToggle}
            conversationId={conversationId}
            nthUserMessageMap={nthUserMessageMap}
            onConversationForked={onConversationForked}
          />
        </motion.div>
        {anchorCell && (
          <motion.div key={`cell-${anchorCell.idx}`} {...motionProps}>
            <TranscriptCells
              cell={anchorCell.cell}
              conversationId={conversationId}
              nthUserMessage={
                anchorCell.cell.kind === 'user-message'
                  ? nthUserMessageMap[anchorCell.cell.id]
                  : undefined
              }
              onConversationForked={onConversationForked}
            />
          </motion.div>
        )}
        {cellsWithIndex.slice(anchorIndex + 1).map(({ cell, idx }) => {
          const nthUserMessage =
            cell.kind === 'user-message'
              ? nthUserMessageMap[cell.id]
              : undefined;
          return (
            <motion.div key={`cell-${idx}`} {...motionProps}>
              <TranscriptCells
                cell={cell}
                conversationId={conversationId}
                nthUserMessage={nthUserMessage}
                onConversationForked={onConversationForked}
              />
            </motion.div>
          );
        })}
      </>
    );
  }

  return renderAllCells();
};

export const TranscriptList = ({
  conversationId,
  turns,
  turnOrder,
  expandedTurns,
  onToggleTurn,
  onConversationForked,
  bottomAnchorRef,
  contentRef,
}: TranscriptListProps) => {
  const nthUserMessageMap = useMemo(() => {
    const map: Record<string, number> = {};
    let nth = 0;
    turnOrder.forEach((id) => {
      const turn = turns[id];
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
  }, [turnOrder, turns]);

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
        {turnEntries.map(({ turnId, turn }, index) => (
          <TranscriptTurnGroup
            key={`turn-${index}`}
            turnId={turnId}
            turn={turn}
            isExpanded={Boolean(expandedTurns[turnId])}
            onToggle={() => onToggleTurn(turnId)}
            conversationId={conversationId}
            nthUserMessageMap={nthUserMessageMap}
            onConversationForked={onConversationForked}
          />
        ))}
      </AnimatePresence>
      <div ref={bottomAnchorRef} className="h-1" />
    </div>
  );
};
