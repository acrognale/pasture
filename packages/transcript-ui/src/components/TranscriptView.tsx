import { useCallback } from 'react';
import type { ComponentType, ReactNode } from 'react';
import type { PluggableList } from 'unified';

import type {
  TranscriptAgentMessageCell,
  TranscriptAgentReasoningCell,
  TranscriptCell,
  TranscriptErrorCell,
  TranscriptExecApprovalCell,
  TranscriptExecCommandCell,
  TranscriptGenericCell,
  TranscriptPatchApprovalCell,
  TranscriptPatchCell,
  TranscriptPlanCell,
  TranscriptSessionConfiguredCell,
  TranscriptStatusCell,
  TranscriptTaskCell,
  TranscriptToolCell,
  TranscriptUserMessageCell,
} from '../types';
import { AgentMessage } from './AgentMessage';
import { AgentReasoning } from './AgentReasoning';
import { Errors } from './Errors';
import { ExecutionApproval } from './ExecutionApproval';
import { ExecutionResult } from './ExecutionResult';
import { ExplorationCell } from './ExplorationCell';
import { MarkdownRendererProps } from './Markdown';
import { Patches } from './Patches';
import { PlanUpdate } from './PlanUpdate';
import { StatusEvents } from './StatusEvents';
import { TaskLifecycle } from './TaskLifecycle';
import { TranscriptList } from './TranscriptList';
import type {
  TranscriptListProps,
  TranscriptListRenderContext,
} from './TranscriptList';
import { UserMessage } from './UserMessage';

export type TranscriptRenderContext = TranscriptListRenderContext;

type OverrideProps<C extends TranscriptCell> = {
  cell: C;
  context: TranscriptRenderContext;
  defaultNode: ReactNode;
};

export type TranscriptViewOverrides = {
  'session-configured'?: (
    props: OverrideProps<TranscriptSessionConfiguredCell>
  ) => ReactNode;
  'user-message'?: (
    props: OverrideProps<TranscriptUserMessageCell>
  ) => ReactNode;
  'agent-message'?: (
    props: OverrideProps<TranscriptAgentMessageCell>
  ) => ReactNode;
  'agent-reasoning'?: (
    props: OverrideProps<TranscriptAgentReasoningCell>
  ) => ReactNode;
  task?: (props: OverrideProps<TranscriptTaskCell>) => ReactNode;
  exec?: (props: OverrideProps<TranscriptExecCommandCell>) => ReactNode;
  'exec-approval'?: (
    props: OverrideProps<TranscriptExecApprovalCell>
  ) => ReactNode;
  plan?: (props: OverrideProps<TranscriptPlanCell>) => ReactNode;
  status?: (props: OverrideProps<TranscriptStatusCell>) => ReactNode;
  error?: (props: OverrideProps<TranscriptErrorCell>) => ReactNode;
  patch?: (props: OverrideProps<TranscriptPatchCell>) => ReactNode;
  'patch-approval'?: (
    props: OverrideProps<TranscriptPatchApprovalCell>
  ) => ReactNode;
  tool?: (props: OverrideProps<TranscriptToolCell>) => ReactNode;
  generic?: (props: OverrideProps<TranscriptGenericCell>) => ReactNode;
};

export type TranscriptViewProps = Omit<TranscriptListProps, 'renderCell'> & {
  overrides?: TranscriptViewOverrides;
  markdownRehypePlugins?: PluggableList;
  markdownRenderer?: ComponentType<MarkdownRendererProps>;
};

const coerceToolToExecCell = (
  cell: TranscriptToolCell
): TranscriptExecCommandCell => ({
  id: `${cell.id}-exec-like`,
  timestamp: cell.timestamp,
  eventIds: cell.eventIds,
  kind: 'exec',
  callId: cell.callId ?? '',
  command: cell.query ? [cell.query] : [],
  cwd: cell.path ?? '',
  parsed: [],
  status: cell.status,
  stdout:
    typeof cell.result === 'string'
      ? cell.result
      : cell.result
        ? JSON.stringify(cell.result, null, 2)
        : '',
  stderr: '',
  aggregatedOutput: '',
  formattedOutput: '',
  exitCode: null,
  duration: cell.duration,
  streaming: cell.status === 'running',
  outputChunks: [],
  exploration: null,
});

const coerceGenericToExecCell = (
  cell: TranscriptGenericCell
): TranscriptExecCommandCell => ({
  id: `${cell.id}-generic-as-exec`,
  timestamp: cell.timestamp,
  eventIds: cell.eventIds,
  kind: 'exec',
  callId: '',
  command: [],
  cwd: '',
  parsed: [],
  status: 'succeeded',
  stdout: '',
  stderr: '',
  aggregatedOutput: '',
  formattedOutput: '',
  exitCode: null,
  duration: null,
  streaming: false,
  outputChunks: [],
  exploration: null,
});

export function TranscriptView({
  overrides,
  markdownRehypePlugins,
  markdownRenderer,
  ...listProps
}: TranscriptViewProps) {
  const renderDefaultCell = useCallback(
    (cell: TranscriptCell) => {
      switch (cell.kind) {
        case 'session-configured':
          return null;
        case 'user-message':
          return <UserMessage cell={cell} />;
        case 'agent-message':
          return (
            <AgentMessage
              cell={cell}
              rehypePlugins={markdownRehypePlugins}
              renderer={markdownRenderer}
            />
          );
        case 'agent-reasoning':
          return cell.visible ? (
            <AgentReasoning
              cell={cell}
              rehypePlugins={markdownRehypePlugins}
              renderer={markdownRenderer}
            />
          ) : null;
        case 'task':
          return <TaskLifecycle cell={cell} />;
        case 'exec-approval':
          return <ExecutionApproval cell={cell} />;
        case 'exec':
          return cell.exploration ? (
            <ExplorationCell cell={cell} />
          ) : (
            <ExecutionResult cell={cell} />
          );
        case 'tool': {
          const execLike = coerceToolToExecCell(cell);
          return <ExecutionResult cell={execLike} />;
        }
        case 'patch':
        case 'patch-approval':
          return <Patches cell={cell} />;
        case 'plan':
          return <PlanUpdate cell={cell} />;
        case 'status':
          return <StatusEvents cell={cell} />;
        case 'error':
          return <Errors cell={cell} />;
        case 'generic': {
          const execLike = coerceGenericToExecCell(cell);
          return <ExecutionResult cell={execLike} />;
        }
        default:
          return null;
      }
    },
    [markdownRehypePlugins]
  );

  const renderCell = useCallback<
    NonNullable<TranscriptListProps['renderCell']>
  >(
    (cell, context) => {
      const defaultNode = renderDefaultCell(cell);

      const override = overrides?.[
        cell.kind as keyof TranscriptViewOverrides
      ] as ((props: OverrideProps<TranscriptCell>) => ReactNode) | undefined;

      if (!override) {
        return defaultNode;
      }

      return override({
        cell,
        context,
        defaultNode,
      });
    },
    [overrides, renderDefaultCell]
  );

  return (
    <TranscriptList
      {...(listProps as TranscriptListProps)}
      renderCell={renderCell}
    />
  );
}
