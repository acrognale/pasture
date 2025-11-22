import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDownIcon } from 'lucide-react';
import { Button } from '~/components/ui/button';
import type { TranscriptCell } from '~/conversation/transcript/types';
import { cn } from '~/lib/utils';

import { TranscriptCells } from './TranscriptCells';

type CollapsedTranscriptSectionProps = {
  hiddenCells: ReadonlyArray<TranscriptCell>;
  isExpanded: boolean;
  onToggle: () => void;
};

export function CollapsedTranscriptSection({
  hiddenCells,
  isExpanded,
  onToggle,
}: CollapsedTranscriptSectionProps) {
  const hiddenCount = hiddenCells.length;
  const collapseLabel = isExpanded
    ? `showing ${hiddenCount} ${hiddenCount === 1 ? 'message' : 'messages'}`
    : `${hiddenCount} ${hiddenCount === 1 ? 'message' : 'messages'} hidden`;

  return (
    <>
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            {hiddenCells.map((cell) => (
              <TranscriptCells key={cell.id} cell={cell} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="my-2 flex items-center gap-2 text-muted-foreground">
        <div className="h-px flex-1 bg-border/80" />
        <Button
          type="button"
          variant="ghost"
          className="inline-flex items-center gap-2 px-3 py-1 text-transcript-micro font-medium hover:text-foreground"
          aria-expanded={isExpanded}
          onClick={onToggle}
        >
          <ChevronDownIcon
            className={cn(
              'size-3 transition-transform text-muted-foreground',
              isExpanded ? 'rotate-180' : 'rotate-0'
            )}
          />
          <span>{collapseLabel}</span>
        </Button>
        <div className="h-px flex-1 bg-border/80" />
      </div>
    </>
  );
}
