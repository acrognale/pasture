import {
  ImagePreview,
  TranscriptProvider,
  TranscriptView as SharedTranscriptView,
  type TranscriptState,
  type TranscriptUserMessageCell,
  type TranscriptViewOverrides,
} from '@pasture/transcript-ui';

type TranscriptViewProps = {
  transcript: TranscriptState;
};

export function TranscriptView({ transcript }: TranscriptViewProps) {
  const overrides: TranscriptViewOverrides = {
    'user-message': ({ cell }) => (
      <ReadOnlyUserMessage cell={cell} />
    ),
  };

  return (
    <div className="rounded-3xl border border-slate-700 bg-slate-800/50 p-6 shadow-inner">
      <TranscriptProvider>
        <SharedTranscriptView
          transcript={transcript}
          className="select-text"
          overrides={overrides}
        />
      </TranscriptProvider>
    </div>
  );
}

function ReadOnlyUserMessage({ cell }: { cell: TranscriptUserMessageCell }) {
  const hasImages = (cell.images?.length ?? 0) > 0;
  const hasMessageKind = !!cell.messageKind && cell.messageKind !== 'plain';

  return (
    <div className="w-full px-1.5 py-2 flex justify-end">
      <div className="flex flex-col items-end gap-1 max-w-[80%]">
        <div className="bg-muted/60 rounded-lg px-3 py-2 w-full space-y-2">
          <div className="whitespace-pre-wrap leading-transcript font-transcript text-transcript-base text-foreground">
            {cell.message ?? ''}
          </div>
          {hasMessageKind ? (
            <div className="text-muted-foreground text-xs">/{cell.messageKind}</div>
          ) : null}
          {hasImages ? (
            <div className="space-y-1">
              <div className="text-muted-foreground text-xs">
                {cell.images?.length ?? 0} image
                {(cell.images?.length ?? 0) === 1 ? '' : 's'} attached
              </div>
              <div className="flex flex-wrap gap-2">
                {(cell.images ?? []).map((path) => (
                  <ImagePreview
                    key={path}
                    path={path}
                    alt={cell.message || 'User attached image'}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
