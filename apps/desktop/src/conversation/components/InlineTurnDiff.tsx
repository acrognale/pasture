import type { TranscriptTurnDiff } from '@pasture/transcript-ui';
import { AnimatePresence, motion } from 'framer-motion';
import { Suspense, lazy, useMemo } from 'react';
import { Skeleton } from '~/components/ui/skeleton';
import { TurnReviewProvider } from '~/review/TurnReviewContext';

const InlineDiffContent = lazy(() =>
  import('./InlineDiffContent').then((m) => ({ default: m.InlineDiffContent }))
);

export type InlineTurnDiffProps = {
  conversationId: string;
  turnNumber: number;
  workspacePath: string;
  unifiedDiff: string;
  isExpanded: boolean;
  onRequestFeedback?: (prompt: string) => void;
  onClose?: () => void;
};

export function InlineTurnDiff({
  conversationId,
  turnNumber,
  workspacePath,
  unifiedDiff,
  isExpanded,
  onRequestFeedback,
  onClose,
}: InlineTurnDiffProps) {
  // Create a synthetic TranscriptTurnDiff for the TurnReviewProvider
  const turnDiff = useMemo<TranscriptTurnDiff>(
    () => ({
      eventId: `inline-${turnNumber}`,
      timestamp: new Date().toISOString(),
      unifiedDiff,
      turnNumber,
    }),
    [turnNumber, unifiedDiff]
  );

  const history = useMemo(() => [turnDiff], [turnDiff]);

  return (
    <AnimatePresence initial={false}>
      {isExpanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className="overflow-hidden"
        >
          <div className="border-t border-border/60 bg-muted/20">
            <TurnReviewProvider
              conversationId={conversationId}
              latestDiff={turnDiff}
              history={history}
            >
              <Suspense
                fallback={
                  <div className="space-y-2 p-3">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-24 w-full" />
                  </div>
                }
              >
                <InlineDiffContent
                  workspacePath={workspacePath}
                  turnNumber={turnNumber}
                  onRequestFeedback={onRequestFeedback}
                  onClose={onClose}
                />
              </Suspense>
            </TurnReviewProvider>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
