import type { TranscriptPlanCell } from '../types';
import { Cell } from './Cell';

type PlanUpdateProps = {
  cell: TranscriptPlanCell;
  timestamp?: string;
};

export function PlanUpdate({ cell }: PlanUpdateProps) {
  // Find the current in-progress step
  const inProgressStep = cell.steps.find((s) => s.status === 'in_progress');

  if (!inProgressStep) {
    return null;
  }

  return (
    <Cell>
      <div className="text-muted-foreground italic">
        Starting: {inProgressStep.step}
      </div>
    </Cell>
  );
}

