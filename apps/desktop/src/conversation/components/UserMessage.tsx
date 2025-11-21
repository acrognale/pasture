import { CopyIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '~/components/ui/button';
import type { TranscriptUserMessageCell } from '~/conversation/transcript/types';
import { copyToClipboard } from '~/lib/utils';

type UserMessageProps = {
  cell: TranscriptUserMessageCell;
  timestamp: string;
};

export function UserMessage({ cell }: UserMessageProps) {
  const message = cell.message ?? '';
  const hasImages = (cell.images?.length ?? 0) > 0;
  const hasMessageKind = !!cell.messageKind && cell.messageKind !== 'plain';

  const handleCopy = async () => {
    if (!message) {
      return;
    }
    const success = await copyToClipboard(message);
    if (success) {
      toast.success('Copied to clipboard');
    } else {
      toast.error('Failed to copy to clipboard');
    }
  };

  return (
    <div className="w-full px-1.5 py-2 flex justify-end group">
      <div className="flex flex-col items-end gap-1 max-w-[80%]">
        <div className="bg-muted/60 rounded-lg px-3 py-1.5 w-full">
          <div className="space-y-1">
            <div className="whitespace-pre-wrap leading-transcript font-transcript text-transcript-base text-foreground">
              {message}
            </div>
            {hasMessageKind ? (
              <div className="text-muted-foreground text-xs">
                /{cell.messageKind}
              </div>
            ) : null}
            {hasImages ? (
              <div className="text-muted-foreground text-xs">
                {cell.images?.length ?? 0} image(s) attached
              </div>
            ) : null}
          </div>
        </div>
        {message ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              void handleCopy();
            }}
            className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Copy as markdown"
          >
            <CopyIcon className="size-3" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
