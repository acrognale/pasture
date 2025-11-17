import { ChevronDown } from 'lucide-react';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { cn } from '~/lib/utils';

import { formatTurnLabel, formatTurnTimestamp } from '../diff-utils';

export type TurnOption = {
  eventId: string;
  turnNumber: number;
  timestamp: string;
};

export type RangeSelectorProps = {
  baseSelectionLabel: string;
  baseSelectionTimestamp: string | null;
  baseDropdownDisabled: boolean;
  hasBaseChoices: boolean;
  baselineSnapshotId: string | null;
  baseTurnId: string | null;
  setBaseTurnId: (id: string | null) => void;
  baseCandidates: TurnOption[];

  patchsetSelectionLabel: string;
  patchsetSelectionTimestamp: string | null;
  patchsetOptions: TurnOption[];
  targetTurnId: string | null;
  selectDiffByEventId: (id: string) => void;

  snapshotDisabled: boolean;
};

export function RangeSelector({
  baseSelectionLabel,
  baseSelectionTimestamp,
  baseDropdownDisabled,
  hasBaseChoices,
  baselineSnapshotId,
  baseTurnId,
  setBaseTurnId,
  baseCandidates,
  patchsetSelectionLabel,
  patchsetSelectionTimestamp,
  patchsetOptions,
  targetTurnId,
  selectDiffByEventId,
  snapshotDisabled,
}: RangeSelectorProps) {
  if (snapshotDisabled) {
    return null;
  }

  return (
    <div className="mt-4 flex flex-wrap items-start gap-6">
      <div className="flex flex-col gap-1">
        <span className="text-transcript-micro font-semibold uppercase tracking-wide text-muted-foreground">
          Base
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 min-w-[10rem] justify-between gap-2 px-3 text-xs"
              disabled={baseDropdownDisabled}
            >
              <span className="flex flex-col items-start text-left">
                <span className="font-medium">{baseSelectionLabel}</span>
                {baseSelectionTimestamp ? (
                  <span className="text-transcript-micro text-muted-foreground">
                    {formatTurnTimestamp(baseSelectionTimestamp)}
                  </span>
                ) : null}
              </span>
              <ChevronDown className="size-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            <DropdownMenuLabel>Select base</DropdownMenuLabel>
            {hasBaseChoices ? (
              <>
                {baselineSnapshotId ? (
                  <DropdownMenuItem
                    className={cn(
                      'flex items-center gap-2',
                      baseTurnId === null ? 'bg-accent/40 text-foreground' : ''
                    )}
                    onSelect={() => setBaseTurnId(null)}
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">
                        Workspace start
                      </span>
                      <span className="text-transcript-micro text-muted-foreground">
                        Initial snapshot
                      </span>
                    </div>
                    {baseTurnId === null ? (
                      <span className="ml-auto text-transcript-micro font-semibold text-primary">
                        ✓
                      </span>
                    ) : null}
                  </DropdownMenuItem>
                ) : null}
                {baselineSnapshotId && baseCandidates.length > 0 ? (
                  <DropdownMenuSeparator />
                ) : null}
                {baseCandidates.map((option) => (
                  <DropdownMenuItem
                    key={option.eventId}
                    className={cn(
                      'flex items-center gap-2',
                      baseTurnId === option.eventId
                        ? 'bg-accent/40 text-foreground'
                        : ''
                    )}
                    onSelect={() => setBaseTurnId(option.eventId)}
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">
                        {formatTurnLabel(option)}
                      </span>
                      <span className="text-transcript-micro text-muted-foreground">
                        {formatTurnTimestamp(option.timestamp)}
                      </span>
                    </div>
                    {baseTurnId === option.eventId ? (
                      <span className="ml-auto text-transcript-micro font-semibold text-primary">
                        ✓
                      </span>
                    ) : null}
                  </DropdownMenuItem>
                ))}
              </>
            ) : (
              <DropdownMenuItem disabled>
                No earlier turns available
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-transcript-micro font-semibold uppercase tracking-wide text-muted-foreground">
          Turn
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 min-w-[10rem] justify-between gap-2 px-3 text-xs"
              disabled={patchsetOptions.length === 0}
            >
              <span className="flex flex-col items-start text-left">
                <span className="font-medium">{patchsetSelectionLabel}</span>
                {patchsetSelectionTimestamp ? (
                  <span className="text-transcript-micro text-muted-foreground">
                    {formatTurnTimestamp(patchsetSelectionTimestamp)}
                  </span>
                ) : null}
              </span>
              <ChevronDown className="size-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            <DropdownMenuLabel>Select patchset</DropdownMenuLabel>
            {patchsetOptions.map((option) => (
              <DropdownMenuItem
                key={option.eventId}
                className={cn(
                  'flex items-center gap-2',
                  targetTurnId === option.eventId
                    ? 'bg-accent/40 text-foreground'
                    : ''
                )}
                onSelect={() => selectDiffByEventId(option.eventId)}
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">
                    {formatTurnLabel(option)}
                  </span>
                  <span className="text-transcript-micro text-muted-foreground">
                    {formatTurnTimestamp(option.timestamp)}
                  </span>
                </div>
                {targetTurnId === option.eventId ? (
                  <span className="ml-auto text-transcript-micro font-semibold text-primary">
                    ✓
                  </span>
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
