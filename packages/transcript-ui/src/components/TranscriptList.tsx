import type { TranscriptCell, TranscriptState, TranscriptTurn } from '../types';

const isAgentOrStatus = (cell: TranscriptCell) =>
  cell.kind === 'agent-message' ||
  (cell.kind === 'status' && cell.statusType === 'turn-aborted');

type TranscriptListProps = {
  transcript: TranscriptState;
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
};

type TranscriptTurnGroupProps = {
  turn: TranscriptTurn;
  turnId: string;
  enableCollapsing: boolean;
  isExpanded: boolean;
  onToggle: () => void;
};

const TranscriptTurnGroup = ({
  turn,
  turnId,
  enableCollapsing,
}: TranscriptTurnGroupProps) => {
  const cellsWithIndex = turn.cells.map((cell, idx) => ({ cell, idx }));

  if (!cellsWithIndex.length) {
    return null;
  }

  // Simple render without collapsing
  const renderAllCells = () =>
    cellsWithIndex.map(({ cell, idx }) => (
      <div key={`cell-${idx}`}>{JSON.stringify(cell)}</div>
    ));

  // Don't collapse active turns or if collapsing is disabled
  const canCollapse = enableCollapsing && turn.status !== 'active';
  if (!canCollapse) {
    return <>{renderAllCells()}</>;
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

    return (
      <>
        <div key={`cell-${firstCell.idx}`}>
          {JSON.stringify(firstCell.cell)}
        </div>
        <div key={`${turnId}-collapsed-${anchorIndex}`}>
          {JSON.stringify(hiddenCells)}
        </div>
        {anchorCell && (
          <div key={`cell-${anchorCell.idx}`}>
            {JSON.stringify(anchorCell.cell)}
          </div>
        )}
        {cellsWithIndex.slice(anchorIndex + 1).map(({ cell, idx }) => (
          <div key={`cell-${idx}`}>{JSON.stringify(cell)}</div>
        ))}
      </>
    );
  }

  return <>{renderAllCells()}</>;
};

/**
 * Renders a list of transcript turns.
 * Supports optional collapsing of intermediate cells in completed turns.
 */
export function TranscriptList({
  transcript,
  className,
  enableCollapsing = true,
  expandedTurns = {},
  onToggleTurn,
}: TranscriptListProps) {
  const { turns, turnOrder } = transcript;

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

  if (turnEntries.length === 0) {
    return (
      <div className="px-6 py-4 text-transcript-muted-foreground text-sm">
        No messages in this transcript.
      </div>
    );
  }

  return (
    <div className={className ?? 'px-6 pt-4 pb-4 select-text'}>
      {turnEntries.map(({ turnId, turn }) => (
        <TranscriptTurnGroup
          key={turnId}
          turnId={turnId}
          turn={turn}
          enableCollapsing={enableCollapsing}
          isExpanded={Boolean(expandedTurns[turnId])}
          onToggle={() => onToggleTurn?.(turnId)}
        />
      ))}
    </div>
  );
}
