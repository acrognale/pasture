import type { GetRepoDiffParams } from '@pasture/protocol';
import { ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { Input } from '~/components/ui/input';
import { Switch } from '~/components/ui/switch';
import { cn } from '~/lib/utils';

function formatRangeLabel(params: GetRepoDiffParams): string {
  if (params.includeWorktree) {
    return `${params.baseRef} → working tree`;
  }
  const target = params.targetRef ?? 'HEAD';
  return `${params.baseRef} → ${target}`;
}

type RepoRangeSelectorProps = {
  params: GetRepoDiffParams;
  onChange: (params: GetRepoDiffParams) => void;
};

export function RepoRangeSelector({ params, onChange }: RepoRangeSelectorProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customBaseRef, setCustomBaseRef] = useState(params.baseRef);
  const [customTargetRef, setCustomTargetRef] = useState(
    params.includeWorktree ? '' : (params.targetRef ?? 'HEAD')
  );
  const [customIncludeWorktree, setCustomIncludeWorktree] = useState(
    params.includeWorktree
  );

  const selectionLabel = useMemo(() => formatRangeLabel(params), [params]);

  const applyCustom = () => {
    const trimmedBase = customBaseRef.trim() || 'HEAD';
    if (customIncludeWorktree) {
      onChange({
        workspacePath: params.workspacePath,
        baseRef: trimmedBase,
        targetRef: null,
        includeWorktree: true,
      });
      setCustomOpen(false);
      return;
    }

    const trimmedTarget = customTargetRef.trim() || 'HEAD';
    onChange({
      workspacePath: params.workspacePath,
      baseRef: trimmedBase,
      targetRef: trimmedTarget,
      includeWorktree: false,
    });
    setCustomOpen(false);
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="text-transcript-micro font-semibold uppercase tracking-wide text-muted-foreground">
        Range
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 min-w-[14rem] justify-between gap-2 px-3 text-xs"
            >
              <span className="flex flex-col items-start text-left">
                <span className="font-medium">{selectionLabel}</span>
                <span className="text-transcript-micro text-muted-foreground">
                  Includes untracked files
                </span>
              </span>
              <ChevronDown className="size-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-72">
            <DropdownMenuLabel>Select range</DropdownMenuLabel>
            <DropdownMenuItem
              className={cn(
                'flex items-center gap-2',
                params.baseRef === 'HEAD' && params.includeWorktree
                  ? 'bg-accent/40 text-foreground'
                  : ''
              )}
              onSelect={() =>
                onChange({
                  workspacePath: params.workspacePath,
                  baseRef: 'HEAD',
                  targetRef: null,
                  includeWorktree: true,
                })
              }
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium">Working tree</span>
                <span className="text-transcript-micro text-muted-foreground">
                  HEAD → working tree
                </span>
              </div>
              {params.baseRef === 'HEAD' && params.includeWorktree ? (
                <span className="ml-auto text-transcript-micro font-semibold text-primary">
                  ✓
                </span>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem
              className={cn(
                'flex items-center gap-2',
                params.baseRef === 'main' &&
                  !params.includeWorktree &&
                  (params.targetRef ?? 'HEAD') === 'HEAD'
                  ? 'bg-accent/40 text-foreground'
                  : ''
              )}
              onSelect={() =>
                onChange({
                  workspacePath: params.workspacePath,
                  baseRef: 'main',
                  targetRef: 'HEAD',
                  includeWorktree: false,
                })
              }
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium">main → HEAD</span>
                <span className="text-transcript-micro text-muted-foreground">
                  Compare default branch to current commit
                </span>
              </div>
              {params.baseRef === 'main' &&
              !params.includeWorktree &&
              (params.targetRef ?? 'HEAD') === 'HEAD' ? (
                <span className="ml-auto text-transcript-micro font-semibold text-primary">
                  ✓
                </span>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                setCustomBaseRef(params.baseRef);
                setCustomIncludeWorktree(params.includeWorktree);
                setCustomTargetRef(
                  params.includeWorktree ? '' : (params.targetRef ?? 'HEAD')
                );
                setCustomOpen(true);
              }}
            >
              Custom…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Custom range</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Base ref
              </label>
              <Input
                value={customBaseRef}
                onChange={(event) => setCustomBaseRef(event.target.value)}
                placeholder="HEAD"
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <label className="text-sm">Compare against working tree</label>
              <Switch
                checked={customIncludeWorktree}
                onCheckedChange={setCustomIncludeWorktree}
              />
            </div>
            {!customIncludeWorktree ? (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Target ref
                </label>
                <Input
                  value={customTargetRef}
                  onChange={(event) => setCustomTargetRef(event.target.value)}
                  placeholder="HEAD"
                />
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCustomOpen(false)}
              >
                Cancel
              </Button>
              <Button type="button" onClick={applyCustom}>
                Apply
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
