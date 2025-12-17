import { Button } from '~/components/ui/button';

import { DiffModeToggle } from './DiffModeToggle';
import type { DiffViewMode } from './FileDiffSection';

export type TurnReviewHeaderProps = {
  showPane: boolean;
  commentCount: number;
  turnNumber?: number;
  title?: string;
  subtitle?: string | null;
  viewMode?: DiffViewMode;
  onViewModeChange?: (mode: DiffViewMode) => void;
  onOpenComments?: () => void;
  canBuildFeedback: boolean;
  disabled?: boolean;
  onGiveFeedback: () => void;
  onClose?: () => void;
  rangeSelector?: React.ReactNode;
};

export function TurnReviewHeader({
  showPane,
  commentCount,
  turnNumber,
  title = 'Review',
  subtitle = null,
  viewMode,
  onViewModeChange,
  onOpenComments,
  canBuildFeedback,
  disabled,
  onGiveFeedback,
  onClose,
  rangeSelector,
}: TurnReviewHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-6">
        <div>
          <p className="text-sm font-semibold">{title}</p>
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
                {subtitle ? (
                  <span className="text-muted-foreground/70 truncate max-w-[360px]">
                    {subtitle}
                  </span>
                ) : null}
              </>
            ) : (
              <span>No diff available</span>
            )}
          </div>
        </div>
        {rangeSelector}
      </div>
      <div className="flex items-center gap-2">
        {viewMode && onViewModeChange ? (
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
        ) : null}
        {onOpenComments ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7"
            disabled={!showPane || disabled}
            onClick={onOpenComments}
          >
            Comments ({commentCount})
          </Button>
        ) : null}
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
