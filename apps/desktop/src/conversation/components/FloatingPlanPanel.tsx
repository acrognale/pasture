import { CellIcon, type TranscriptPlanCell } from '@pasture/transcript-ui';
import { LayoutGroup, motion } from 'framer-motion';
import { ChevronLeftIcon, ChevronRightIcon, Loader2Icon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useLatestPlan } from '../store/hooks';

type FloatingPlanPanelProps = {
  conversationId: string;
};

type PlanStepStatus = TranscriptPlanCell['steps'][number]['status'];

const getStepIcon = (status: PlanStepStatus) => {
  if (status === 'completed') return 'success';
  if (status === 'in_progress') return 'in-progress';
  return 'pending';
};

const getStepClass = (status: PlanStepStatus) => {
  if (status === 'completed') return 'text-muted-foreground';
  if (status === 'in_progress') return 'text-foreground';
  return 'text-muted-foreground/60';
};

const springTransition = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 30,
};

export function FloatingPlanPanel({ conversationId }: FloatingPlanPanelProps) {
  const latestPlan = useLatestPlan(conversationId);
  const [minimizedForTurn, setMinimizedForTurn] = useState<string | null>(null);

  const isMinimized = latestPlan && minimizedForTurn === latestPlan.turnId;

  // Reset minimized state when a new turn with a plan appears
  useEffect(() => {
    if (latestPlan && latestPlan.turnId !== minimizedForTurn) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMinimizedForTurn(null);
    }
  }, [latestPlan, minimizedForTurn]);

  if (!latestPlan) {
    return null;
  }

  const { plan } = latestPlan;
  const completedCount = plan.steps.filter(
    (s) => s.status === 'completed'
  ).length;
  const totalCount = plan.steps.length;

  return (
    <LayoutGroup>
      <motion.div
        layout
        className="absolute bottom-4 right-4 z-10 rounded-lg border border-border/70 bg-background/95 shadow-lg backdrop-blur-sm overflow-hidden"
        initial={{ x: 100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={springTransition}
        style={{
          originX: 1,
          originY: 1,
        }}
      >
        {isMinimized ? (
          <motion.button
            layout
            type="button"
            className="flex items-center gap-1 px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
            onClick={() => setMinimizedForTurn(null)}
            aria-label="Show plan"
            transition={springTransition}
          >
            <ChevronLeftIcon className="size-4" />
            <span className="text-xs font-medium">
              {completedCount}/{totalCount}
            </span>
          </motion.button>
        ) : (
          <motion.div layout className="w-80" transition={springTransition}>
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <span>Plan</span>
                <span className="text-xs text-muted-foreground font-normal">
                  {completedCount}/{totalCount}
                </span>
              </div>
              <button
                type="button"
                className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-muted"
                onClick={() => setMinimizedForTurn(latestPlan.turnId)}
                aria-label="Minimize plan"
              >
                <ChevronRightIcon className="size-4" />
              </button>
            </div>

            {/* Steps */}
            <div
              className="overflow-y-auto px-3 py-2"
              style={{ maxHeight: 200 }}
            >
              {plan.steps.length > 0 ? (
                <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1.5">
                  {plan.steps.map((step, index) => (
                    <div key={`${step.step}-${index}`} className="contents">
                      <div className="flex items-center justify-center h-5">
                        {step.status === 'in_progress' ? (
                          <Loader2Icon className="size-3 animate-spin text-muted-foreground" />
                        ) : (
                          <CellIcon status={getStepIcon(step.status)} />
                        )}
                      </div>
                      <div
                        className={`text-sm leading-5 ${getStepClass(step.status)}`}
                      >
                        {step.step}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground italic">
                  No steps provided
                </div>
              )}
            </div>
          </motion.div>
        )}
      </motion.div>
    </LayoutGroup>
  );
}
