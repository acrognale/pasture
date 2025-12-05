import type { FileChange } from '@pasture/protocol';
import { useState } from 'react';

import { useTranscriptContext } from '../context/TranscriptContext';
import { cn, makePathRelative, splitLines } from '../lib/utils';
import type {
  TranscriptPatchApprovalCell,
  TranscriptPatchCell,
} from '../types';
import { ApprovalActions } from './ApprovalActions';
import { Cell } from './Cell';
import { CellIcon } from './CellIcon';

type PatchesProps = {
  cell: TranscriptPatchCell | TranscriptPatchApprovalCell;
  /** Whether this approval is currently active (for approval cells) */
  isApprovalActive?: boolean;
  /** Number of approvals in the queue */
  queueSize?: number;
  /** Whether a response is pending */
  isPending?: boolean;
  /** Callback when user approves */
  onApprove?: () => void;
  /** Callback when user rejects */
  onReject?: () => void;
};

const countChanges = (
  changes: Record<string, FileChange | undefined> | undefined
) => (changes ? Object.keys(changes).length : 0);

const getFileChangeStats = (change: FileChange | undefined) => {
  if (!change) {
    return { added: 0, removed: 0 };
  }

  const countNonTrailingEmpty = (lines: string[]) => {
    if (lines.length === 0) return 0;
    const trimmed = [...lines];
    while (trimmed.length > 0 && trimmed[trimmed.length - 1] === '') {
      trimmed.pop();
    }
    return trimmed.length;
  };

  switch (change.type) {
    case 'add': {
      const lines = splitLines(change.content);
      return { added: countNonTrailingEmpty(lines), removed: 0 };
    }
    case 'delete': {
      const lines = splitLines(change.content);
      return { added: 0, removed: countNonTrailingEmpty(lines) };
    }
    case 'update': {
      const lines = splitLines(change.unified_diff);
      let added = 0;
      let removed = 0;
      for (const line of lines) {
        if (
          line.startsWith('@@') ||
          line.startsWith('+++') ||
          line.startsWith('---')
        ) {
          continue;
        }
        if (line.startsWith('+')) {
          added += 1;
        } else if (line.startsWith('-')) {
          removed += 1;
        }
      }
      return { added, removed };
    }
    default:
      return { added: 0, removed: 0 };
  }
};

const describeFileChange = (change: FileChange | undefined) => {
  if (!change) {
    return {
      label: 'modified',
      description: 'Unknown change',
      diff: null,
    };
  }

  switch (change.type) {
    case 'add':
      return {
        label: 'added',
        description: 'New file',
        diff: change.content,
      };
    case 'delete':
      return {
        label: 'deleted',
        description: 'File removed',
        diff: change.content,
      };
    case 'update':
      return {
        label: 'updated',
        description: change.move_path
          ? `Moved to ${change.move_path}`
          : 'File updated',
        diff: change.unified_diff,
      };
    default:
      return {
        label: 'modified',
        description: 'Unknown change',
        diff: null,
      };
  }
};

const FileChangeItem = ({
  path,
  change,
  workspacePath,
}: {
  path: string;
  change: FileChange | undefined;
  workspacePath?: string;
}) => {
  const { label, description, diff } = describeFileChange(change);
  const diffLines = diff ? splitLines(diff) : [];
  const { added, removed } = getFileChangeStats(change);

  const [isOpen, setIsOpen] = useState(true);

  const displayPath = (() => {
    if (!path) return '';
    if (workspacePath) {
      return makePathRelative(workspacePath, path);
    }
    return path;
  })();

  const getDiffLineClass = (line: string) => {
    if (line.startsWith('+')) return 'text-success-foreground';
    if (line.startsWith('-')) return 'text-error-foreground';
    if (line.startsWith('@@')) return 'text-info-foreground';
    return 'text-muted-foreground';
  };

  const hasDiff = diffLines.length > 0;

  return (
    <div className="rounded-transcript border border-border/60 bg-card/60">
      <div className="flex items-start gap-1.5 px-1.5 py-1">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="inline-flex min-w-0 items-center gap-1 text-transcript-base text-foreground">
            <span className="shrink overflow-hidden whitespace-nowrap text-ellipsis">
              {displayPath}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              ({label})
            </span>
          </div>
          {description ? (
            <div className="text-xs text-muted-foreground">{description}</div>
          ) : null}
        </div>
        <div className="flex items-center gap-1 pl-1">
          {added > 0 || removed > 0 ? (
            <div className="inline-flex items-baseline gap-1 text-xs font-medium">
              {added > 0 ? (
                <span className="tabular-nums text-success-foreground">
                  +{added}
                </span>
              ) : null}
              {removed > 0 ? (
                <span className="tabular-nums text-error-foreground">
                  -{removed}
                </span>
              ) : null}
            </div>
          ) : null}
          {hasDiff ? (
            <button
              type="button"
              className={cn(
                'inline-flex size-4 items-center justify-center rounded-sm border border-transparent text-xs text-foreground/80 transition-colors',
                'hover:bg-foreground/5 hover:text-foreground'
              )}
              aria-label={isOpen ? 'Hide details' : 'Show details'}
              aria-expanded={isOpen}
              onClick={() => setIsOpen((open) => !open)}
            >
              <svg viewBox="0 0 24 24" className="size-3">
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d={
                    isOpen
                      ? 'm7 20 5-5 5 5M7 4l5 5 5-5'
                      : 'M7 10l5-5 5 5M7 14l5 5 5-5'
                  }
                />
              </svg>
            </button>
          ) : null}
        </div>
      </div>
      {hasDiff && isOpen ? (
        <div className="border-t border-border/60 bg-background/40">
          <pre className="overflow-x-auto whitespace-pre text-xs font-mono leading-transcript-code px-1.5 py-1.5">
            {diffLines.map((line, index) => (
              <div key={`${path}-${index}`} className={getDiffLineClass(line)}>
                {line.length > 0 ? line : ' '}
              </div>
            ))}
          </pre>
        </div>
      ) : null}
    </div>
  );
};

const FileChanges = ({
  changes,
  title,
  workspacePath,
  showTitle = true,
}: {
  changes: Record<string, FileChange | undefined> | undefined;
  title: string;
  workspacePath?: string;
  showTitle?: boolean;
}) => {
  const entries = Object.entries(changes ?? {});

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1.5">
      {showTitle && title ? (
        <div className="text-xs font-medium uppercase text-muted-foreground">
          {title}
        </div>
      ) : null}
      <div className="space-y-1.5">
        {entries.map(([path, change]) => (
          <FileChangeItem
            key={path}
            path={path}
            change={change}
            workspacePath={workspacePath}
          />
        ))}
      </div>
    </div>
  );
};

export function Patches({
  cell,
  isApprovalActive = false,
  queueSize = 0,
  isPending = false,
  onApprove,
  onReject,
}: PatchesProps) {
  const { workspacePath } = useTranscriptContext();

  const iconStatus = (() => {
    if (cell.kind === 'patch-approval') {
      return 'warning';
    }
    if (cell.status === 'succeeded') return 'success';
    if (cell.status === 'failed') return 'failure';
    return 'running';
  })();

  if (cell.kind === 'patch-approval') {
    const changeCount = countChanges(cell.changes);

    return (
      <Cell icon={<CellIcon status={iconStatus} />}>
        <div className="space-y-2">
          <div className="text-warning-foreground whitespace-pre-wrap leading-transcript">
            {cell.reason ?? 'The agent wants to apply a patch.'}
          </div>
          <div className="text-xs text-muted-foreground">
            files touched: {changeCount}
            {cell.grantRoot ? (
              <span className="ml-1.5 text-warning-foreground/90">
                • request root access for {cell.grantRoot}
              </span>
            ) : null}
          </div>
          <FileChanges
            changes={cell.changes}
            title="Proposed edits"
            workspacePath={workspacePath}
          />
          <ApprovalActions
            decision={cell.decision}
            approvalType="patch"
            isActive={isApprovalActive}
            queueSize={queueSize}
            isPending={isPending}
            onApprove={onApprove ?? (() => {})}
            onReject={onReject ?? (() => {})}
          />
        </div>
      </Cell>
    );
  }

  const changeTitle =
    cell.status === 'succeeded'
      ? 'Applied edits:'
      : cell.status === 'failed'
        ? 'Edits attempted'
        : 'Edits to apply';

  const changeCount = countChanges(cell.changes);
  const hasStdout = (cell.stdout ?? '').trim().length > 0;
  const hasStderr = (cell.stderr ?? '').trim().length > 0;

  const statusText =
    cell.status === 'failed'
      ? 'Patch failed'
      : cell.status === 'applying'
        ? 'Applying patch…'
        : null;

  return (
    <Cell>
      <div className="space-y-1.5">
        <FileChanges
          changes={cell.changes}
          title={changeTitle}
          workspacePath={workspacePath}
          showTitle={false}
        />
        {(statusText || hasStdout || hasStderr) && (
          <div className="space-y-0.5 pt-1">
            {statusText ? (
              <div
                className={cn(
                  'text-xs',
                  cell.status === 'failed'
                    ? 'text-error-foreground'
                    : 'text-muted-foreground'
                )}
              >
                {statusText} • files touched: {changeCount} • auto approved:{' '}
                {cell.autoApproved ? 'yes' : 'no'}
              </div>
            ) : null}
            {hasStdout ? (
              <pre className="overflow-x-auto whitespace-pre-wrap text-xs leading-transcript text-success-foreground">
                {cell.stdout}
              </pre>
            ) : null}
            {hasStderr ? (
              <pre className="overflow-x-auto whitespace-pre-wrap text-xs leading-transcript text-error-foreground">
                {cell.stderr}
              </pre>
            ) : null}
          </div>
        )}
      </div>
    </Cell>
  );
}
