import {
  TranscriptList,
  TranscriptProvider,
  type TranscriptState,
} from '@pasture/transcript-ui';
import { renderTranscriptCell } from './TranscriptCellRenderer';

type TranscriptViewProps = {
  transcript: TranscriptState;
};

export function TranscriptView({ transcript }: TranscriptViewProps) {
  return (
    <div className="rounded-3xl border border-slate-700 bg-slate-800/50 p-6 shadow-inner">
      <TranscriptProvider>
        <TranscriptList
          transcript={transcript}
          className="select-text"
          renderCell={(cell) => renderTranscriptCell(cell)}
        />
      </TranscriptProvider>
    </div>
  );
}
