import { Fragment } from 'react';

import { TranscriptCells } from './TranscriptCells';
import type {
  SharedTranscriptState,
  SharedTranscriptTurn,
} from '@/types/sharedTranscript';

type TranscriptListProps = {
  transcript: SharedTranscriptState;
};

export function TranscriptList({ transcript }: TranscriptListProps) {
  const { turnOrder, turns } = transcript;

  if (!turnOrder.length) {
    return (
      <div className="text-sm text-slate-500">
        This thread does not have any messages yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {turnOrder.map((turnId) => {
        const turn = turns[turnId];
        if (!turn) {
          return null;
        }
        return (
          <TurnBlock key={turnId} turn={turn} />
        );
      })}
    </div>
  );
}

function TurnBlock({ turn }: { turn: SharedTranscriptTurn }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/70 px-5 py-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
        <span>Turn</span>
        {turn.status ? <span className="text-slate-400">{turn.status}</span> : null}
      </div>
      <div className="space-y-4">
        {turn.cells.map((cell) => (
          <Fragment key={cell.id}>
            <TranscriptCells cell={cell} turnStatus={turn.status} />
          </Fragment>
        ))}
      </div>
    </div>
  );
}
