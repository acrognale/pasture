import { Button } from '~/components/ui/button';

import { DiffModeToggle } from './DiffModeToggle';
import type { DiffViewMode } from './FileDiffSection';

export type TurnReviewHeaderProps = {
  showPane: boolean;
  commentCount: number;
  turnNumber?: number;
  viewMode: DiffViewMode;
  onViewModeChange: (mode: DiffViewMode) => void;
  canBuildFeedback: boolean;
  disabled?: boolean;
  onGiveFeedback: () => void;
  onClose?: () => void;
};

export function TurnReviewHeader({
  showPane,
  commentCount,
  turnNumber,
  viewMode,
  onViewModeChange,
  canBuildFeedback,
  disabled,
  onGiveFeedback,
  onClose,
}: TurnReviewHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-sm font-semibold">Review</p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {showPane ? (
            <>
              <span>
                {commentCount} comment{commentCount === 1 ? '' : 's'}
              </span>
              {turnNumber !== undefined ? (
                <span className="text-muted-foreground/70">
                  Turn {turnNumber}
                </span>
              ) : null}
            </>
          ) : (
            <span>No diff available</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-md border border-border/60 bg-muted/40 p-0.5">
          <DiffModeToggle
            label="Split"
            active={viewMode === 'split'}
            onClick={() => onViewModeChange('split')}
          />
          <DiffModeToggle
            label="Unified"
            active={viewMode === 'unified'}
            onClick={() => onViewModeChange('unified')}
          />
        </div>
        <Button
          type="button"
          size="sm"
          className="h-7"
          disabled={!showPane || !canBuildFeedback || disabled}
          onClick={onGiveFeedback}
        >
          Submit
        </Button>
        {onClose ? (
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        ) : null}
      </div>
    </div>
  );
}
