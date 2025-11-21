import type { TranscriptPlanCell } from '~/conversation/transcript/types';

import { Cell } from './Cell';
import { CellIcon } from './CellIcon';

type PlanUpdateProps = {
  cell: TranscriptPlanCell;
  timestamp: string;
};

const getStepIcon = (status: string) => {
  if (status === 'completed') return 'success';
  if (status === 'in_progress') return 'in-progress';
  return 'pending';
};

const getStepClass = (status: string) => {
  if (status === 'completed') return 'text-muted-foreground';
  if (status === 'in_progress') return 'text-foreground';
  return 'text-muted-foreground/60';
};

export function PlanUpdate({ cell }: PlanUpdateProps) {
  return (
    <Cell>
      <div className="space-y-2">
        {cell.steps.length > 0 ? (
          <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1.5 pl-2 items-center">
            {cell.steps.map((step, index) => (
              <>
                <div
                  key={`${step.step}-${index}-icon`}
                  className="flex items-center justify-center"
                >
                  <CellIcon status={getStepIcon(step.status)} />
                </div>
                <div
                  key={`${step.step}-${index}-text`}
                  className={`whitespace-pre-wrap leading-transcript ${getStepClass(step.status)}`}
                >
                  {step.step}
                </div>
              </>
            ))}
          </div>
        ) : (
          <div className="text-muted-foreground italic pl-4">
            (no steps provided)
          </div>
        )}
      </div>
    </Cell>
  );
}
