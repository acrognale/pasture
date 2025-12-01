import { TranscriptList } from './TranscriptList';
import type { SharedTranscriptState } from '@/types/sharedTranscript';

type TranscriptViewProps = {
  transcript: SharedTranscriptState;
};

export function TranscriptView({ transcript }: TranscriptViewProps) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 shadow-inner">
      <TranscriptList transcript={transcript} />
    </div>
  );
}
