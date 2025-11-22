import { ApprovalActions } from '~/approvals/components/ApprovalActions';
import { useApprovals } from '~/approvals/hooks/useApprovals';
import { useRespondToApproval } from '~/approvals/hooks/useRespondToApproval';
import type { FileChange } from '~/codex.gen/FileChange';
import type {
  TranscriptPatchApprovalCell,
  TranscriptPatchCell,
} from '~/conversation/transcript/types';

import { splitLines } from '../transcript-utils';
import { Cell } from './Cell';
import { CellIcon } from './CellIcon';

type PatchesProps = {
  cell: TranscriptPatchCell | TranscriptPatchApprovalCell;
};

const countChanges = (
  changes: Record<string, FileChange | undefined> | undefined
) => (changes ? Object.keys(changes).length : 0);

const describeFileChange = (path: string, change: FileChange | undefined) => {
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
}: {
  path: string;
  change: FileChange | undefined;
}) => {
  const { label, description, diff } = describeFileChange(path, change);
  const diffLines = diff ? splitLines(diff) : [];

  const getDiffLineClass = (line: string) => {
    if (line.startsWith('+')) return 'text-success-foreground';
    if (line.startsWith('-')) return 'text-error-foreground';
    if (line.startsWith('@@')) return 'text-info-foreground';
    return 'text-muted-foreground';
  };

  return (
    <div className="space-y-0.5 pl-4">
      <div className="text-transcript-base text-foreground">
        {path} ({label})
      </div>
      {description ? (
        <div className="text-xs text-muted-foreground pl-2">{description}</div>
      ) : null}
      {diff ? (
        <pre className="text-xs font-mono pl-2 overflow-x-auto whitespace-pre-wrap">
          {diffLines.map((line, index) => (
            <div key={`${path}-${index}`} className={getDiffLineClass(line)}>
              {line.length > 0 ? line : ' '}
            </div>
          ))}
        </pre>
      ) : null}
    </div>
  );
};

const FileChanges = ({
  changes,
  title,
}: {
  changes: Record<string, FileChange | undefined> | undefined;
  title: string;
}) => {
  const entries = Object.entries(changes ?? {});

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1.5">
      <div className="text-transcript-base text-muted-foreground">{title}</div>
      <div className="space-y-2">
        {entries.map(([path, change]) => (
          <FileChangeItem key={path} path={path} change={change} />
        ))}
      </div>
    </div>
  );
};

export function Patches({ cell }: PatchesProps) {
  const approvals = useApprovals();
  const respondToApproval = useRespondToApproval();

  const isApproval = cell.kind === 'patch-approval';
  const isCurrentApprovalActive =
    isApproval &&
    approvals.activeRequest !== null &&
    approvals.activeRequest.kind === 'patch' &&
    approvals.activeRequest.eventId === cell.id;

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
          <div className="text-muted-foreground">
            files touched: {changeCount}
          </div>
          <div className="text-warning-foreground whitespace-pre-wrap leading-transcript">
            {cell.reason ?? 'The agent wants to apply a patch.'}
          </div>
          {cell.grantRoot ? (
            <div className="text-warning-foreground/80 pl-2">
              request root access for {cell.grantRoot}
            </div>
          ) : null}
          <FileChanges changes={cell.changes} title="Proposed edits:" />
          <ApprovalActions
            decision={cell.decision}
            approvalType="patch"
            isActive={Boolean(isCurrentApprovalActive)}
            queueSize={approvals.queueSize}
            isPending={respondToApproval.isPending}
            onApprove={() => {
              const request = approvals.activeRequest;
              if (!request) return;
              respondToApproval.mutate({ request, decision: 'approve' });
            }}
            onReject={() => {
              const request = approvals.activeRequest;
              if (!request) return;
              respondToApproval.mutate({ request, decision: 'abort' });
            }}
          />
        </div>
      </Cell>
    );
  }

  const changeCount = countChanges(cell.changes);
  const statusText =
    cell.status === 'succeeded'
      ? 'Patch applied'
      : cell.status === 'failed'
        ? 'Patch failed'
        : 'Applying patch…';

  const statusClass =
    cell.status === 'succeeded'
      ? 'text-success-foreground'
      : cell.status === 'failed'
        ? 'text-error-foreground'
        : 'text-foreground';

  const changeTitle =
    cell.status === 'succeeded'
      ? 'Applied edits:'
      : cell.status === 'failed'
        ? 'Edits attempted:'
        : 'Edits to apply:';

  const hasStdout = cell.stdout.trim().length > 0;
  const hasStderr = cell.stderr.trim().length > 0;

  return (
    <Cell icon={<CellIcon status={iconStatus} />}>
      <div className="space-y-1.5">
        <div className={statusClass}>{statusText}</div>
        <div className="text-transcript-base text-muted-foreground">
          files touched: {changeCount} • auto approved:{' '}
          {cell.autoApproved ? 'yes' : 'no'}
        </div>
        <FileChanges changes={cell.changes} title={changeTitle} />
        {hasStdout ? (
          <pre className="text-xs text-success-foreground overflow-x-auto leading-transcript whitespace-pre-wrap pl-2">
            {cell.stdout}
          </pre>
        ) : null}
        {hasStderr ? (
          <pre className="text-xs text-error-foreground overflow-x-auto leading-transcript whitespace-pre-wrap pl-2">
            {cell.stderr}
          </pre>
        ) : null}
      </div>
    </Cell>
  );
}
