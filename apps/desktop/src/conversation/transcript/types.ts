import type { AgentMessageContent } from '~/codex.gen/AgentMessageContent';
import type { AgentMessageItem } from '~/codex.gen/AgentMessageItem';
import type { ApplyPatchApprovalRequestEvent } from '~/codex.gen/ApplyPatchApprovalRequestEvent';
import type { EventMsg } from '~/codex.gen/EventMsg';
import type { ExecApprovalRequestEvent } from '~/codex.gen/ExecApprovalRequestEvent';
import type { ExecCommandBeginEvent } from '~/codex.gen/ExecCommandBeginEvent';
import type { ExecCommandEndEvent } from '~/codex.gen/ExecCommandEndEvent';
import type { ExecOutputStream } from '~/codex.gen/ExecOutputStream';
import type { FileChange } from '~/codex.gen/FileChange';
import type { McpInvocation } from '~/codex.gen/McpInvocation';
import type { ParsedCommand } from '~/codex.gen/ParsedCommand';
import type { PatchApplyBeginEvent } from '~/codex.gen/PatchApplyBeginEvent';
import type { PatchApplyEndEvent } from '~/codex.gen/PatchApplyEndEvent';
import type { ReasoningEffort } from '~/codex.gen/ReasoningEffort';
import type { ReasoningItem } from '~/codex.gen/ReasoningItem';
import type { StepStatus } from '~/codex.gen/StepStatus';
import type { TurnItem } from '~/codex.gen/TurnItem';
import type { UserInput } from '~/codex.gen/UserInput';
import type { UserMessageItem } from '~/codex.gen/UserMessageItem';
import type { WebSearchItem } from '~/codex.gen/WebSearchItem';

import type { CellLocation, Indices } from './indices';

export type TranscriptCellKind =
  | 'session-configured'
  | 'user-message'
  | 'agent-message'
  | 'agent-reasoning'
  | 'task'
  | 'exec'
  | 'exec-approval'
  | 'plan'
  | 'status'
  | 'error'
  | 'patch'
  | 'patch-approval'
  | 'tool'
  | 'generic';

type BaseTranscriptCell = {
  id: string;
  timestamp: string;
  eventIds: string[];
  kind: TranscriptCellKind;
};

export type TranscriptSessionConfiguredCell = BaseTranscriptCell & {
  kind: 'session-configured';
  sessionId: string;
  model: string;
  reasoningEffort: ReasoningEffort | null;
  rolloutPath: string;
  historyEntryCount: number;
};

export type TranscriptUserMessageCell = BaseTranscriptCell & {
  kind: 'user-message';
  message: string;
  messageKind: string;
  images: string[] | null;
  itemId: string | null;
};

export type TranscriptAgentMessageCell = BaseTranscriptCell & {
  kind: 'agent-message';
  message: string;
  streaming: boolean;
  itemId: string | null;
};

export type TranscriptAgentReasoningCell = BaseTranscriptCell & {
  kind: 'agent-reasoning';
  text: string;
  streaming: boolean;
  visible: boolean;
  itemId: string | null;
};

export type TranscriptTaskCell = BaseTranscriptCell & {
  kind: 'task';
  status: 'started' | 'complete';
  modelContextWindow: string | null;
  lastAgentMessage: string | null;
  startedAt: string | null;
};

export type ExecOutputChunk = {
  stream: ExecOutputStream;
  chunk: string;
};

export type ExecStreamDecoders = {
  stdout: TextDecoder;
  stderr: TextDecoder;
};

export type TranscriptExplorationCall = {
  callId: string;
  command: string[];
  parsed: ParsedCommand[];
  status: 'running' | 'succeeded' | 'failed';
  duration: string | null;
};

export type TranscriptExecCommandCell = BaseTranscriptCell & {
  kind: 'exec';
  callId: string;
  command: string[];
  cwd: string;
  parsed: ParsedCommand[];
  status: 'running' | 'succeeded' | 'failed';
  stdout: string;
  stderr: string;
  aggregatedOutput: string;
  formattedOutput: string;
  exitCode: number | null;
  duration: string | null;
  streaming: boolean;
  outputChunks: ExecOutputChunk[];
  exploration: { calls: TranscriptExplorationCall[] } | null;
};

export type TranscriptExecApprovalCell = BaseTranscriptCell & {
  kind: 'exec-approval';
  callId: string;
  command: string[];
  cwd: string;
  reason: string | null;
  decision: 'pending' | 'approved' | 'approved_for_session' | 'rejected';
};

export type TranscriptPlanCell = BaseTranscriptCell & {
  kind: 'plan';
  explanation: string | null;
  steps: Array<{ step: string; status: StepStatus }>;
};

export type TranscriptStatusCell = BaseTranscriptCell & {
  kind: 'status';
  statusType: 'token-count' | 'turn-aborted' | 'background';
  summary: string;
  data: unknown;
};

export type TranscriptErrorCell = BaseTranscriptCell & {
  kind: 'error';
  severity: 'error' | 'stream';
  message: string;
};

export type TranscriptPatchCell = BaseTranscriptCell & {
  kind: 'patch';
  callId: string;
  autoApproved: boolean;
  changes: Record<string, FileChange | undefined>;
  status: 'applying' | 'succeeded' | 'failed';
  stdout: string;
  stderr: string;
  success: boolean | null;
};

export type TranscriptPatchApprovalCell = BaseTranscriptCell & {
  kind: 'patch-approval';
  callId: string;
  reason: string | null;
  grantRoot: string | null;
  changes: Record<string, FileChange | undefined>;
  decision: 'pending' | 'approved' | 'rejected';
};

export type TranscriptToolCell = BaseTranscriptCell & {
  kind: 'tool';
  toolType: 'mcp' | 'web-search' | 'view-image';
  status: 'running' | 'succeeded' | 'failed';
  callId: string | null;
  invocation: McpInvocation | null;
  result: unknown;
  duration: string | null;
  path: string | null;
  query: string | null;
  itemId: string | null;
};

export type TranscriptGenericCell = BaseTranscriptCell & {
  kind: 'generic';
  eventType: string;
  payload: unknown;
};

export type TranscriptCell =
  | TranscriptSessionConfiguredCell
  | TranscriptUserMessageCell
  | TranscriptAgentMessageCell
  | TranscriptAgentReasoningCell
  | TranscriptTaskCell
  | TranscriptExecCommandCell
  | TranscriptExecApprovalCell
  | TranscriptPlanCell
  | TranscriptStatusCell
  | TranscriptErrorCell
  | TranscriptPatchCell
  | TranscriptPatchApprovalCell
  | TranscriptToolCell
  | TranscriptGenericCell;

export type TranscriptReasoningSummaryFormat = 'none' | 'experimental';

export type TranscriptTurnStatus = 'active' | 'completed' | 'aborted';

export type TranscriptTurn = {
  id: string;
  cells: TranscriptCell[];
  startedAt: string | null;
  completedAt: string | null;
  status: TranscriptTurnStatus;
};

export type TranscriptState = {
  turns: Record<string, TranscriptTurn>;
  turnOrder: string[];
  latestReasoningHeader: string | null;
  pendingReasoningText: string | null;
  pendingTaskStartedAt: string | null;
  shouldBreakExecGroup: boolean;
  openUserMessageCell: CellLocation | null;
  openAgentMessageCell: CellLocation | null;
  reasoningSummaryFormat: TranscriptReasoningSummaryFormat;
  indices: Indices;
  latestTurnDiff: TranscriptTurnDiff | null;
  turnDiffHistory: TranscriptTurnDiff[];
  turnCounter: number;
  activeTurnId: string | null;
  activeTurnNumber: number | null;
};

export type TranscriptEventContext = {
  eventId: string;
  timestamp: string;
};

export type TranscriptEvent = EventMsg;

export type TranscriptTurnItem = TurnItem;

export type TranscriptUserInput = UserInput;

export type TranscriptReasoningItem = ReasoningItem;

export type TranscriptAgentMessageContent = AgentMessageContent;

export type TranscriptAgentMessageItem = AgentMessageItem;

export type TranscriptUserMessageItem = UserMessageItem;

export type TranscriptWebSearchItem = WebSearchItem;

export type TranscriptExecBeginEvent = ExecCommandBeginEvent;

export type TranscriptExecEndEvent = ExecCommandEndEvent;

export type TranscriptExecApprovalEvent = ExecApprovalRequestEvent;

export type TranscriptPatchBeginEvent = PatchApplyBeginEvent;

export type TranscriptPatchEndEvent = PatchApplyEndEvent;

export type TranscriptPatchApprovalEvent = ApplyPatchApprovalRequestEvent;

export type TranscriptTurnDiff = {
  eventId: string;
  timestamp: string;
  unifiedDiff: string;
  turnNumber: number;
  headSnapshotId?: string | null;
};
