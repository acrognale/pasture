import type { AgentMessageDeltaEvent } from '@pasture/protocol';
import type { AgentMessageEvent } from '@pasture/protocol';
import type { AgentReasoningDeltaEvent } from '@pasture/protocol';
import type { AgentReasoningEvent } from '@pasture/protocol';
import type { AgentReasoningRawContentDeltaEvent } from '@pasture/protocol';
import type { AgentReasoningRawContentEvent } from '@pasture/protocol';
import type { ApplyPatchApprovalRequestEvent } from '@pasture/protocol';
import type { BackgroundEventEvent } from '@pasture/protocol';
import type { ConversationEventPayload } from '@pasture/protocol';
import type { ErrorEvent } from '@pasture/protocol';
import type { ExecApprovalRequestEvent } from '@pasture/protocol';
import type { ExecCommandBeginEvent } from '@pasture/protocol';
import type { ExecCommandEndEvent } from '@pasture/protocol';
import type { ExecCommandOutputDeltaEvent } from '@pasture/protocol';
import type { McpToolCallBeginEvent } from '@pasture/protocol';
import type { McpToolCallEndEvent } from '@pasture/protocol';
import type { PatchApplyBeginEvent } from '@pasture/protocol';
import type { PatchApplyEndEvent } from '@pasture/protocol';
import type { RateLimitSnapshot } from '@pasture/protocol';
import type { ReasoningContentDeltaEvent } from '@pasture/protocol';
import type { ReasoningRawContentDeltaEvent } from '@pasture/protocol';
import type { ReasoningSummary } from '@pasture/protocol';
import type { ReadThreadEndEvent } from '@pasture/protocol';
import type { SessionConfiguredEvent } from '@pasture/protocol';
import type { StreamErrorEvent } from '@pasture/protocol';
import type { TaskCompleteEvent } from '@pasture/protocol';
import type { TokenCountEvent } from '@pasture/protocol';
import type { TokenUsageInfo } from '@pasture/protocol';
import type { TurnAbortedEvent } from '@pasture/protocol';
import type { TurnDiffEvent } from '@pasture/protocol';
import type { UpdatePlanArgs } from '@pasture/protocol';
import type { UserMessageEvent } from '@pasture/protocol';
import type { ViewImageToolCallEvent } from '@pasture/protocol';
import type { WarningEvent } from '@pasture/protocol';
import type { WebSearchBeginEvent } from '@pasture/protocol';
import type { WebSearchEndEvent } from '@pasture/protocol';
import type {
  CellLocation,
  ExecStreamDecoders,
  TranscriptAgentMessageCell,
  TranscriptAgentReasoningCell,
  TranscriptCell,
  TranscriptErrorCell,
  TranscriptExecApprovalCell,
  TranscriptExecCommandCell,
  TranscriptExplorationCall,
  TranscriptPatchApprovalCell,
  TranscriptPatchCell,
  TranscriptPlanCell,
  TranscriptSessionConfiguredCell,
  TranscriptState,
  TranscriptStatusCell,
  TranscriptTaskCell,
  TranscriptToolCell,
  TranscriptTurn,
  TranscriptTurnDiff,
  TranscriptUserMessageCell,
} from '@pasture/transcript-ui';
import { produce } from 'immer';
import type { Draft } from 'immer';
import { extractFirstBold } from '~/lib/markdown';
import { safeStringify } from '~/lib/utils';

import {
  findExecCellByCallId,
  findExplorationAnchor,
  findLatestTaskCell,
  findPatchCellByCallId,
  findToolCellByCallId,
} from '../transcript/selectors';
import { createInitialTranscriptState } from '../transcript/state';
import {
  deriveReasoningSummaryFormat,
  hasReasoningBody,
  stripReasoningHeader,
} from '../transcript/utils/reasoning';
import { decodeBase64ToUint8Array } from '../transcript/utils/streams';
import type { QueuedUserMessage } from '../types';
import { DEFAULT_STATUS_HEADER } from './constants';

/**
 * Unified conversation state combining transcript + runtime metadata.
 * This is the single source of truth for all conversation data.
 */
export type ConversationState = {
  /** The transcript containing all cells and their data */
  transcript: TranscriptState;

  /** Runtime metadata fields */
  contextTokensInWindow: number | null;
  maxContextWindow: number | null;
  statusHeader: string;
  statusOverride: string | null;
  reasoningSummaryPreference: ReasoningSummary | null;

  /** Lifecycle state */
  isLoading: boolean;
  error: Error | null;
};

export type ConversationSideEffect = {
  type: 'toast';
  variant: 'info' | 'warning' | 'error';
  title: string;
  description?: string;
};

export type ConversationControllerState = {
  conversation: ConversationState;
  conversationId: string | null;
  /** Monotonic counter for agent messages within this conversation; used to derive stable message IDs. */
  agentMessageOrdinal: number;
  sideEffects: ConversationSideEffect[];
  retryStatusHeader: string | null;
  reasoningBuffer: string;
  fullReasoningBuffer: string;
  tokenInfo: TokenUsageInfo | null;
  rateLimitSnapshot: RateLimitSnapshot | null;
  ingestedEvents: ConversationEventPayload[];
  queuedUserMessages: QueuedUserMessage[];
  isSendingUserMessage: boolean;
};

export type ConversationControllerSnapshot = ConversationControllerState;

export type ConversationControllerOptions = {
  conversationId?: string;
};

/**
 * Create initial conversation state combining transcript + runtime metadata.
 */
export function createInitialConversationState(): ConversationState {
  return {
    transcript: createInitialTranscriptState(),
    contextTokensInWindow: null,
    maxContextWindow: null,
    statusHeader: DEFAULT_STATUS_HEADER,
    statusOverride: null,
    reasoningSummaryPreference: null,
    isLoading: false,
    error: null,
  };
}

export const createConversationControllerState = (
  options?: ConversationControllerOptions
): ConversationControllerState => ({
  conversation: createInitialConversationState(),
  conversationId: options?.conversationId ?? null,
  agentMessageOrdinal: 0,
  sideEffects: [],
  retryStatusHeader: null,
  reasoningBuffer: '',
  fullReasoningBuffer: '',
  tokenInfo: null,
  rateLimitSnapshot: null,
  ingestedEvents: [],
  queuedUserMessages: [],
  isSendingUserMessage: false,
});

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

export function setReasoningSummaryPreference(
  state: ConversationControllerState | Draft<ConversationControllerState>,
  preference: ReasoningSummary | null
) {
  state.conversation.reasoningSummaryPreference = preference;
  if (!preference) {
    return;
  }
  state.conversation.transcript.reasoningSummaryFormat =
    preference === 'none' ? 'none' : 'experimental';
}

function ensureTurn(
  transcript: TranscriptState,
  turnId: string
): TranscriptTurn {
  const existing = transcript.turns[turnId];
  if (existing) {
    return existing;
  }
  const created: TranscriptTurn = {
    id: turnId,
    cells: [],
    startedAt: null,
    completedAt: null,
    status: 'active',
  };
  transcript.turns[turnId] = created;
  transcript.turnOrder = [...transcript.turnOrder, turnId];
  return created;
}

function appendCell(
  state: ConversationControllerState | Draft<ConversationControllerState>,
  turnId: string,
  cell: TranscriptCell
): CellLocation {
  const transcript = (state as ConversationControllerState).conversation
    .transcript;
  const turn = ensureTurn(transcript, turnId);
  const cells = turn.cells;
  const cellIndex = cells.push(cell) - 1;
  turn.cells = cells;
  return { turnId, cellIndex };
}

function getCellAtLocation(
  transcript: TranscriptState,
  location: CellLocation | null | undefined
): { cell: TranscriptCell; location: CellLocation } | null {
  if (!location) {
    return null;
  }
  const turn = transcript.turns[location.turnId];
  if (!turn) {
    return null;
  }
  const cell = turn.cells[location.cellIndex];
  if (!cell) {
    return null;
  }
  return { cell, location };
}

function appendEventId(
  state: ConversationControllerState | Draft<ConversationControllerState>,
  cell: TranscriptCell,
  eventId: string
) {
  if (!cell.eventIds.includes(eventId)) {
    cell.eventIds = [...cell.eventIds, eventId];
  }
}

function extractReasoningHeader(buffer: string): string | null {
  return extractFirstBold(buffer);
}

function isExplorationParsed(
  parsed: ExecCommandBeginEvent['parsed_cmd']
): boolean {
  return (
    parsed.length > 0 &&
    parsed.every(
      (entry) =>
        entry.type === 'read' ||
        entry.type === 'list_files' ||
        entry.type === 'search'
    )
  );
}

function createExplorationCall(
  event: ExecCommandBeginEvent
): TranscriptExplorationCall {
  return {
    callId: event.call_id,
    command: event.command,
    parsed: event.parsed_cmd,
    status: 'running',
    duration: null,
  };
}

function ensureExecDecoders(
  execDecoders: Record<string, ExecStreamDecoders>,
  callId: string
): ExecStreamDecoders {
  const decoders = execDecoders[callId];
  if (decoders) {
    return decoders;
  }
  const next: ExecStreamDecoders = {
    stdout: new TextDecoder('utf-8', { fatal: false }),
    stderr: new TextDecoder('utf-8', { fatal: false }),
  };
  execDecoders[callId] = next;
  return next;
}

function removeExecDecoders(
  execDecoders: Record<string, ExecStreamDecoders>,
  callId: string
) {
  delete execDecoders[callId];
}

function now(): string {
  return new Date().toISOString();
}

function getOpenAgentCell(
  state: ConversationControllerState | Draft<ConversationControllerState>
): {
  cell: TranscriptAgentMessageCell;
  location: CellLocation;
} | null {
  const transcript = state.conversation.transcript as TranscriptState;
  const located = getCellAtLocation(
    transcript,
    transcript.openAgentMessageCell
  );
  if (!located || located.cell.kind !== 'agent-message') {
    return null;
  }
  return { cell: located.cell, location: located.location };
}

function closeActiveAgentCell(
  state: ConversationControllerState | Draft<ConversationControllerState>
) {
  const open = getOpenAgentCell(state);
  if (open) {
    open.cell.streaming = false;
  }
  state.conversation.transcript.openAgentMessageCell = null;
}

function appendAgentDelta(
  state: ConversationControllerState | Draft<ConversationControllerState>,
  turnId: string,
  delta: string,
  timestamp: string,
  eventId: string
) {
  if (!delta) {
    return;
  }
  const open = getOpenAgentCell(state);
  if (open && open.location.turnId === turnId) {
    open.cell.message += delta;
    open.cell.streaming = true;
    appendEventId(state, open.cell, eventId);
    return;
  }
  const entry: TranscriptAgentMessageCell = {
    id: eventId,
    kind: 'agent-message',
    timestamp,
    eventIds: [eventId],
    message: delta,
    streaming: true,
    itemId: null,
  };
  const location = appendCell(state, turnId, entry);
  state.conversation.transcript.openAgentMessageCell = location;
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

function onSessionConfigured(
  draft: Draft<ConversationControllerState>,
  event: SessionConfiguredEvent,
  conversationId: string,
  eventId: string,
  turnId: string,
  timestamp: string,
  _ingest: (payload: ConversationEventPayload) => void
): void {
  draft.conversationId = conversationId ?? event.session_id;
  const entry: TranscriptSessionConfiguredCell = {
    id: eventId,
    kind: 'session-configured',
    timestamp,
    eventIds: [eventId],
    sessionId: event.session_id,
    model: event.model,
    reasoningEffort: event.reasoning_effort,
    rolloutPath: event.rollout_path,
    historyEntryCount: event.history_entry_count,
  };
  appendCell(draft, turnId, entry);
  draft.conversation.transcript.reasoningSummaryFormat =
    deriveReasoningSummaryFormat(event.model);
  const preference = draft.conversation.reasoningSummaryPreference;
  if (preference) {
    draft.conversation.reasoningSummaryPreference = preference;
    draft.conversation.transcript.reasoningSummaryFormat =
      preference === 'none' ? 'none' : 'experimental';
  }
  // Historical transcript events are replayed from rollout history during thread
  // initialization, so streaming session_configured events intentionally skip
  // initial_messages to avoid duplicating the RPC response when windows reconnect.
}

function onUserMessage(
  draft: Draft<ConversationControllerState>,
  event: UserMessageEvent,
  eventId: string,
  turnId: string,
  timestamp: string
): void {
  const transcript = draft.conversation.transcript as TranscriptState;
  const images = event.images && event.images.length > 0 ? event.images : null;

  const openLocation =
    transcript.openUserMessageCell?.turnId === turnId
      ? transcript.openUserMessageCell
      : null;
  const existing = getCellAtLocation(transcript, openLocation);
  let nextLocation = openLocation;

  if (!existing || existing.cell.kind !== 'user-message') {
    const entry: TranscriptUserMessageCell = {
      id: eventId,
      kind: 'user-message',
      timestamp,
      eventIds: [eventId],
      message: event.message,
      messageKind: 'plain',
      images,
      itemId: null,
    };
    nextLocation = appendCell(draft, turnId, entry);
  } else {
    existing.cell.message = event.message;
    existing.cell.images = images;
    existing.cell.timestamp = timestamp;
    appendEventId(draft, existing.cell, eventId);
  }

  transcript.openUserMessageCell = nextLocation ?? null;
  transcript.latestTurnDiff = null;
  transcript.activeTurnId = turnId;
  closeActiveAgentCell(draft);
  transcript.shouldBreakExecGroup = true;
}

function onAgentMessageDelta(
  draft: Draft<ConversationControllerState>,
  event: AgentMessageDeltaEvent,
  eventId: string,
  turnId: string,
  timestamp: string
): void {
  appendAgentDelta(draft, turnId, event.delta, timestamp, eventId);
  draft.conversation.transcript.activeTurnId = turnId;
}

function onAgentMessage(
  draft: Draft<ConversationControllerState>,
  event: AgentMessageEvent,
  eventId: string,
  turnId: string,
  timestamp: string,
  conversationId: string | null | undefined
): void {
  const conversationKey =
    draft.conversationId ?? conversationId ?? 'unknown-conversation';
  const messageId = `agent::${conversationKey}::${draft.agentMessageOrdinal}`;
  draft.agentMessageOrdinal += 1;

  const open = getOpenAgentCell(draft);
  if (open && open.location.turnId === turnId) {
    open.cell.message = event.message;
    open.cell.itemId = open.cell.itemId ?? messageId;
    appendEventId(draft, open.cell, eventId);
    closeActiveAgentCell(draft);
    draft.conversation.transcript.openUserMessageCell = null;
    draft.conversation.transcript.activeTurnId = turnId;
    return;
  }
  const entry: TranscriptAgentMessageCell = {
    id: eventId,
    kind: 'agent-message',
    timestamp,
    eventIds: [eventId],
    message: event.message,
    streaming: false,
    itemId: messageId,
  };
  appendCell(draft, turnId, entry);
  draft.conversation.transcript.openUserMessageCell = null;
  draft.conversation.transcript.openAgentMessageCell = null;
  draft.conversation.transcript.activeTurnId = turnId;
}

function onAgentReasoningDelta(
  draft: Draft<ConversationControllerState>,
  event:
    | AgentReasoningDeltaEvent
    | AgentReasoningRawContentDeltaEvent
    | ReasoningContentDeltaEvent
    | ReasoningRawContentDeltaEvent,
  _eventId: string,
  turnId: string,
  _timestamp: string
): void {
  draft.reasoningBuffer += event.delta;
  draft.fullReasoningBuffer += event.delta;
  const header = extractReasoningHeader(draft.reasoningBuffer);
  if (
    header &&
    header !== draft.conversation.transcript.latestReasoningHeader
  ) {
    draft.conversation.transcript.latestReasoningHeader = header;
    draft.conversation.statusHeader = header;
  }
  draft.conversation.transcript.pendingReasoningText = draft.reasoningBuffer;
  draft.conversation.transcript.activeTurnId = turnId;
}

function onAgentReasoning(
  draft: Draft<ConversationControllerState>,
  event: AgentReasoningEvent | AgentReasoningRawContentEvent,
  eventId: string,
  turnId: string,
  timestamp: string
): void {
  const providedText = 'text' in event ? event.text : null;
  const combined =
    providedText && providedText.trim().length > 0
      ? providedText
      : draft.reasoningBuffer || draft.fullReasoningBuffer;
  const sanitized = stripReasoningHeader(combined).trim();
  const showSummaries =
    draft.conversation.transcript.reasoningSummaryFormat === 'experimental';
  const hasBody = sanitized ? hasReasoningBody(sanitized) : false;
  if (!sanitized || !hasBody) {
    draft.reasoningBuffer = '';
    draft.fullReasoningBuffer = '';
    draft.conversation.transcript.pendingReasoningText = null;
    draft.conversation.transcript.latestReasoningHeader = null;
    return;
  }
  const entry: TranscriptAgentReasoningCell = {
    id: eventId,
    kind: 'agent-reasoning',
    timestamp,
    eventIds: [eventId],
    text: sanitized,
    streaming: false,
    visible: showSummaries && hasBody,
    itemId: null,
  };
  appendCell(draft, turnId, entry);
  draft.reasoningBuffer = '';
  draft.fullReasoningBuffer = '';
  draft.conversation.transcript.pendingReasoningText = null;
  draft.conversation.transcript.latestReasoningHeader = null;
  draft.conversation.transcript.activeTurnId = turnId;
}

function onAgentReasoningSectionBreak(
  draft: Draft<ConversationControllerState>
): void {
  draft.fullReasoningBuffer += draft.reasoningBuffer;
  draft.fullReasoningBuffer += '\n\n';
  draft.reasoningBuffer = '';
}

function onExecCommandBegin(
  draft: Draft<ConversationControllerState>,
  event: ExecCommandBeginEvent,
  eventId: string,
  turnId: string,
  timestamp: string,
  execDecoders: Record<string, ExecStreamDecoders>
): void {
  const transcript = draft.conversation.transcript as TranscriptState;
  const isExploration = isExplorationParsed(event.parsed_cmd);

  if (!transcript.shouldBreakExecGroup && isExploration) {
    const anchor = findExplorationAnchor(transcript, turnId);
    if (anchor?.cell.exploration) {
      anchor.cell.exploration.calls = [
        ...anchor.cell.exploration.calls,
        createExplorationCall(event),
      ];
      anchor.cell.callId = event.call_id;
      anchor.cell.status = 'running';
      anchor.cell.streaming = true;
      appendEventId(draft, anchor.cell, eventId);
      ensureExecDecoders(execDecoders, event.call_id);
      return;
    }
  }

  transcript.shouldBreakExecGroup = false;
  const cell: TranscriptExecCommandCell = {
    id: eventId,
    kind: 'exec',
    timestamp,
    eventIds: [eventId],
    callId: event.call_id,
    command: event.command,
    cwd: event.cwd,
    parsed: event.parsed_cmd,
    status: 'running',
    stdout: '',
    stderr: '',
    aggregatedOutput: '',
    formattedOutput: '',
    exitCode: null,
    duration: null,
    streaming: true,
    outputChunks: [],
    exploration: isExploration
      ? { calls: [createExplorationCall(event)] }
      : null,
  };
  appendCell(draft, turnId, cell);
  ensureExecDecoders(execDecoders, event.call_id);
  transcript.activeTurnId = turnId;
}

function onExecCommandOutputDelta(
  draft: Draft<ConversationControllerState>,
  event: ExecCommandOutputDeltaEvent,
  eventId: string,
  turnId: string,
  execDecoders: Record<string, ExecStreamDecoders>
): void {
  const transcript = draft.conversation.transcript as TranscriptState;
  const target = findExecCellByCallId(transcript, turnId, event.call_id);
  if (!target) {
    return;
  }

  const { cell } = target;
  const decoders = ensureExecDecoders(execDecoders, event.call_id);
  const bytes = decodeBase64ToUint8Array(event.chunk);
  const decoded =
    event.stream === 'stdout'
      ? decoders.stdout.decode(bytes, { stream: true })
      : decoders.stderr.decode(bytes, { stream: true });

  cell.outputChunks = [
    ...cell.outputChunks,
    { stream: event.stream, chunk: decoded },
  ];
  if (event.stream === 'stdout') {
    cell.stdout += decoded;
  } else {
    cell.stderr += decoded;
  }
  cell.aggregatedOutput += decoded;
  appendEventId(draft, cell, eventId);
  transcript.activeTurnId = turnId;
}

function onExecCommandEnd(
  draft: Draft<ConversationControllerState>,
  event: ExecCommandEndEvent,
  eventId: string,
  turnId: string,
  timestamp: string,
  execDecoders: Record<string, ExecStreamDecoders>
): void {
  const transcript = draft.conversation.transcript as TranscriptState;
  const target = findExecCellByCallId(transcript, turnId, event.call_id);

  if (target) {
    const { cell } = target;
    if (cell.exploration) {
      const updatedCalls = cell.exploration.calls.map(
        (call): TranscriptExplorationCall =>
          call.callId === event.call_id
            ? {
                ...call,
                status: event.exit_code === 0 ? 'succeeded' : 'failed',
                duration: event.duration,
              }
            : call
      );
      const stillRunning = updatedCalls.some(
        (call) => call.status === 'running'
      );
      cell.exploration = { calls: updatedCalls };
      cell.status = stillRunning ? 'running' : 'succeeded';
      cell.streaming = stillRunning;
    } else {
      cell.status = event.exit_code === 0 ? 'succeeded' : 'failed';
      cell.stdout = event.stdout;
      cell.stderr = event.stderr;
      cell.aggregatedOutput = event.aggregated_output;
      cell.formattedOutput = event.formatted_output;
      cell.exitCode = event.exit_code;
      cell.duration = event.duration;
      cell.streaming = false;
    }
    appendEventId(draft, cell, eventId);
  } else {
    const cell: TranscriptExecCommandCell = {
      id: eventId,
      kind: 'exec',
      timestamp,
      eventIds: [eventId],
      callId: event.call_id,
      command: [],
      cwd: '',
      parsed: [],
      status: event.exit_code === 0 ? 'succeeded' : 'failed',
      stdout: event.stdout,
      stderr: event.stderr,
      aggregatedOutput: event.aggregated_output,
      formattedOutput: event.formatted_output,
      exitCode: event.exit_code,
      duration: event.duration,
      streaming: false,
      outputChunks: [],
      exploration: null,
    };
    appendCell(draft, turnId, cell);
  }

  removeExecDecoders(execDecoders, event.call_id);
  transcript.activeTurnId = turnId;
}

function onTaskStarted(
  draft: Draft<ConversationControllerState>,
  turnId: string,
  timestamp: string
): void {
  const transcript = draft.conversation.transcript as TranscriptState;
  const turn = ensureTurn(transcript, turnId);
  turn.startedAt = turn.startedAt ?? timestamp;
  turn.status = 'active';
  transcript.pendingReasoningText = null;
  transcript.latestReasoningHeader = null;
  transcript.latestTurnDiff = null;
  transcript.activeTurnId = turnId;
  draft.conversation.statusHeader = 'Processing...';
}

function onTaskComplete(
  draft: Draft<ConversationControllerState>,
  event: TaskCompleteEvent,
  eventId: string,
  turnId: string,
  timestamp: string
): void {
  closeActiveAgentCell(draft);
  const transcript = draft.conversation.transcript as TranscriptState;
  const turn = ensureTurn(transcript, turnId);
  const startedAt = turn.startedAt;
  const target = findLatestTaskCell(transcript, turnId);
  if (target && target.cell.status === 'started') {
    target.cell.status = 'complete';
    target.cell.lastAgentMessage = event.last_agent_message ?? null;
    target.cell.startedAt = target.cell.startedAt ?? startedAt ?? null;
    appendEventId(draft, target.cell, eventId);
  } else {
    const cell: TranscriptTaskCell = {
      id: eventId,
      kind: 'task',
      timestamp,
      eventIds: [eventId],
      status: 'complete',
      modelContextWindow: null,
      lastAgentMessage: event.last_agent_message ?? null,
      startedAt: startedAt ?? null,
    };
    appendCell(draft, turnId, cell);
  }
  transcript.activeTurnId = null;
  transcript.shouldBreakExecGroup = true;
  transcript.openUserMessageCell = null;
  draft.conversation.statusHeader = DEFAULT_STATUS_HEADER;
  turn.completedAt = turn.completedAt ?? timestamp;
  turn.status = 'completed';
}

function onPlanUpdate(
  draft: Draft<ConversationControllerState>,
  event: UpdatePlanArgs,
  eventId: string,
  turnId: string,
  timestamp: string
): void {
  const entry: TranscriptPlanCell = {
    id: eventId,
    kind: 'plan',
    timestamp,
    eventIds: [eventId],
    explanation: event.explanation,
    steps: event.plan.map((item) => ({
      step: item.step,
      status: item.status,
    })),
  };
  appendCell(draft, turnId, entry);
}

function onTurnAborted(
  draft: Draft<ConversationControllerState>,
  event: TurnAbortedEvent,
  eventId: string,
  turnId: string,
  timestamp: string
): void {
  const transcript = draft.conversation.transcript as TranscriptState;
  const targetTurn = transcript.turns[turnId];
  const turnsToInspect = targetTurn
    ? [targetTurn]
    : Object.values(transcript.turns);
  turnsToInspect.forEach((turn) => {
    turn.cells.forEach((cell) => {
      if (cell.kind !== 'exec') {
        return;
      }
      const hadRunningExec = cell.status === 'running';
      const hadRunningExploration =
        cell.exploration?.calls.some((call) => call.status === 'running') ??
        false;
      if (hadRunningExec) {
        cell.status = 'failed';
        cell.streaming = false;
        appendEventId(draft, cell, eventId);
      }
      if (cell.exploration && hadRunningExploration) {
        cell.exploration = {
          calls: cell.exploration.calls.map((call) =>
            call.status === 'running' ? { ...call, status: 'failed' } : call
          ),
        };
        cell.status = 'failed';
        cell.streaming = false;
        appendEventId(draft, cell, eventId);
      }
    });
  });

  const entry: TranscriptStatusCell = {
    id: eventId,
    kind: 'status',
    timestamp,
    eventIds: [eventId],
    statusType: 'turn-aborted',
    summary: `Turn aborted: ${event.reason}`,
    data: event,
  };
  appendCell(draft, turnId, entry);
  transcript.pendingReasoningText = null;
  transcript.latestReasoningHeader = null;
  transcript.latestTurnDiff = null;
  transcript.activeTurnId = null;
  transcript.openUserMessageCell = null;
  transcript.shouldBreakExecGroup = true;
  draft.conversation.statusHeader = DEFAULT_STATUS_HEADER;
  closeActiveAgentCell(draft);
  if (targetTurn) {
    targetTurn.status = 'aborted';
    targetTurn.completedAt = targetTurn.completedAt ?? timestamp;
  }
}

function onBackgroundEvent(
  draft: Draft<ConversationControllerState>,
  event: BackgroundEventEvent,
  eventId: string,
  turnId: string,
  timestamp: string
): void {
  const entry: TranscriptStatusCell = {
    id: eventId,
    kind: 'status',
    timestamp,
    eventIds: [eventId],
    statusType: 'background',
    summary: event.message,
    data: event,
  };
  appendCell(draft, turnId, entry);
}

function onTokenCount(
  draft: Draft<ConversationControllerState>,
  event: TokenCountEvent,
  _eventId: string,
  _timestamp: string
): void {
  draft.tokenInfo = event.info;
  draft.rateLimitSnapshot = event.rate_limits;
  const usage = event.info?.last_token_usage ?? event.info?.total_token_usage;
  if (usage) {
    const contextTokensInWindow = Math.max(
      usage.total_tokens - usage.reasoning_output_tokens,
      0
    );
    draft.conversation.contextTokensInWindow = contextTokensInWindow;
  }
  if (event.info?.model_context_window) {
    draft.conversation.maxContextWindow = Number(
      event.info.model_context_window
    );
  }
}

function onTurnDiff(
  draft: Draft<ConversationControllerState>,
  event: TurnDiffEvent,
  eventId: string,
  turnId: string,
  timestamp: string
): void {
  const transcript = draft.conversation.transcript as TranscriptState;
  const history = transcript.turnDiffHistory;
  const turnIndex = transcript.turnOrder.indexOf(turnId);
  const turnNumber =
    turnIndex >= 0 ? turnIndex + 1 : transcript.turnOrder.length + 1;

  const entry: TranscriptTurnDiff = {
    eventId,
    timestamp,
    unifiedDiff: event.unified_diff ?? '',
    turnNumber,
    // Map to the backend snapshot key so turn review can request
    // cumulative diffs using Codex's turn identifier rather than
    // the frontend-local eventId.
    turnId,
  };

  const existingIndex = history.findIndex(
    (record) => record.turnNumber === turnNumber
  );
  if (existingIndex >= 0) {
    const next = [...history];
    next[existingIndex] = entry;
    transcript.turnDiffHistory = next;
  } else {
    transcript.turnDiffHistory = [...history, entry];
  }

  transcript.latestTurnDiff = entry;
  transcript.activeTurnId = turnId;
}

function onExecApprovalRequest(
  draft: Draft<ConversationControllerState>,
  event: ExecApprovalRequestEvent,
  eventId: string,
  turnId: string,
  timestamp: string
): void {
  const entry: TranscriptExecApprovalCell = {
    id: eventId,
    kind: 'exec-approval',
    timestamp,
    eventIds: [eventId],
    callId: event.call_id,
    command: event.command,
    cwd: event.cwd,
    reason: event.reason,
    decision: 'pending',
  };
  appendCell(draft, turnId, entry);
}

function onPatchApplyBegin(
  draft: Draft<ConversationControllerState>,
  event: PatchApplyBeginEvent,
  eventId: string,
  turnId: string,
  timestamp: string
): void {
  const cell: TranscriptPatchCell = {
    id: eventId,
    kind: 'patch',
    timestamp,
    eventIds: [eventId],
    callId: event.call_id,
    autoApproved: event.auto_approved,
    changes: event.changes,
    status: 'applying',
    stdout: '',
    stderr: '',
    success: null,
  };
  appendCell(draft, turnId, cell);
}

function onPatchApplyEnd(
  draft: Draft<ConversationControllerState>,
  event: PatchApplyEndEvent,
  eventId: string,
  turnId: string,
  timestamp: string
): void {
  const transcript = draft.conversation.transcript as TranscriptState;
  const target = findPatchCellByCallId(transcript, turnId, event.call_id);
  if (target) {
    target.cell.status = event.success ? 'succeeded' : 'failed';
    target.cell.stdout = event.stdout;
    target.cell.stderr = event.stderr;
    target.cell.success = event.success;
    appendEventId(draft, target.cell, eventId);
    return;
  }

  const cell: TranscriptPatchCell = {
    id: eventId,
    kind: 'patch',
    timestamp,
    eventIds: [eventId],
    callId: event.call_id,
    autoApproved: false,
    changes: {},
    status: event.success ? 'succeeded' : 'failed',
    stdout: event.stdout,
    stderr: event.stderr,
    success: event.success,
  };
  appendCell(draft, turnId, cell);
}

function onReadThreadEnd(
  draft: Draft<ConversationControllerState>,
  event: ReadThreadEndEvent,
  eventId: string,
  turnId: string,
  timestamp: string
): void {
  const transcript = draft.conversation.transcript as TranscriptState;
  const target = findToolCellByCallId(
    transcript,
    turnId,
    'read-thread',
    event.call_id
  );

  const resultText = event.success
    ? event.summary
    : (event.error_message ?? '');

  if (target) {
    target.cell.status = event.success ? 'succeeded' : 'failed';
    target.cell.result = resultText;
    target.cell.query = event.instructions ?? '';
    target.cell.path = event.thread_ref ?? '';
    appendEventId(draft, target.cell, eventId);
    return;
  }

  const cell: TranscriptToolCell = {
    id: eventId,
    kind: 'tool',
    timestamp,
    eventIds: [eventId],
    toolType: 'read-thread',
    status: event.success ? 'succeeded' : 'failed',
    callId: event.call_id,
    invocation: null,
    result: resultText,
    duration: null,
    path: event.thread_ref ?? '',
    query: event.instructions ?? '',
    itemId: null,
  };
  appendCell(draft, turnId, cell);
}

function onPatchApprovalRequest(
  draft: Draft<ConversationControllerState>,
  event: ApplyPatchApprovalRequestEvent,
  eventId: string,
  turnId: string,
  timestamp: string
): void {
  const entry: TranscriptPatchApprovalCell = {
    id: eventId,
    kind: 'patch-approval',
    timestamp,
    eventIds: [eventId],
    callId: event.call_id,
    reason: event.reason,
    grantRoot: event.grant_root,
    changes: event.changes,
    decision: 'pending',
  };
  appendCell(draft, turnId, entry);
}

function onMcpToolCallBegin(
  draft: Draft<ConversationControllerState>,
  event: McpToolCallBeginEvent,
  eventId: string,
  turnId: string,
  timestamp: string
): void {
  const cell: TranscriptToolCell = {
    id: eventId,
    kind: 'tool',
    timestamp,
    eventIds: [eventId],
    toolType: 'mcp',
    status: 'running',
    callId: event.call_id,
    invocation: event.invocation,
    result: null,
    duration: null,
    path: null,
    query: null,
    itemId: null,
  };
  appendCell(draft, turnId, cell);
}

function onMcpToolCallEnd(
  draft: Draft<ConversationControllerState>,
  event: McpToolCallEndEvent,
  eventId: string,
  turnId: string,
  timestamp: string
): void {
  const transcript = draft.conversation.transcript as TranscriptState;
  const target = findToolCellByCallId(transcript, turnId, 'mcp', event.call_id);
  const callResult = event.result;
  const isError = 'Err' in callResult;
  const status = isError ? 'failed' : 'succeeded';
  const resolvedResult = isError ? callResult.Err : callResult.Ok;

  if (target) {
    target.cell.status = status;
    target.cell.result = resolvedResult;
    target.cell.duration = event.duration;
    target.cell.invocation = event.invocation;
    appendEventId(draft, target.cell, eventId);
    return;
  }

  const cell: TranscriptToolCell = {
    id: eventId,
    kind: 'tool',
    timestamp,
    eventIds: [eventId],
    toolType: 'mcp',
    status,
    callId: event.call_id,
    invocation: event.invocation,
    result: resolvedResult,
    duration: event.duration,
    path: null,
    query: null,
    itemId: null,
  };
  appendCell(draft, turnId, cell);
}

function onWebSearchBegin(
  draft: Draft<ConversationControllerState>,
  event: WebSearchBeginEvent,
  eventId: string,
  turnId: string,
  timestamp: string
): void {
  const transcript = draft.conversation.transcript as TranscriptState;
  const target = findToolCellByCallId(
    transcript,
    turnId,
    'web-search',
    event.call_id
  );
  if (target) {
    target.cell.status = 'running';
    target.cell.callId = event.call_id;
    appendEventId(draft, target.cell, eventId);
    return;
  }
  const cell: TranscriptToolCell = {
    id: eventId,
    kind: 'tool',
    timestamp,
    eventIds: [eventId],
    toolType: 'web-search',
    status: 'running',
    callId: event.call_id,
    invocation: null,
    result: null,
    duration: null,
    path: null,
    query: null,
    itemId: null,
  };
  appendCell(draft, turnId, cell);
}

function onWebSearchEnd(
  draft: Draft<ConversationControllerState>,
  event: WebSearchEndEvent,
  eventId: string,
  turnId: string,
  timestamp: string
): void {
  const transcript = draft.conversation.transcript as TranscriptState;
  const target = findToolCellByCallId(
    transcript,
    turnId,
    'web-search',
    event.call_id
  );
  if (target) {
    target.cell.status = 'succeeded';
    target.cell.callId = event.call_id;
    target.cell.itemId = event.call_id;
    target.cell.query = event.query;
    appendEventId(draft, target.cell, eventId);
    return;
  }
  const cell: TranscriptToolCell = {
    id: eventId,
    kind: 'tool',
    timestamp,
    eventIds: [eventId],
    toolType: 'web-search',
    status: 'succeeded',
    callId: event.call_id,
    invocation: null,
    result: null,
    duration: null,
    path: null,
    query: event.query,
    itemId: event.call_id,
  };
  appendCell(draft, turnId, cell);
}

function onViewImageToolCall(
  draft: Draft<ConversationControllerState>,
  event: ViewImageToolCallEvent,
  eventId: string,
  turnId: string,
  timestamp: string
): void {
  const cell: TranscriptToolCell = {
    id: eventId,
    kind: 'tool',
    timestamp,
    eventIds: [eventId],
    toolType: 'view-image',
    status: 'succeeded',
    callId: event.call_id,
    invocation: null,
    result: null,
    duration: null,
    path: event.path,
    query: null,
    itemId: null,
  };
  appendCell(draft, turnId, cell);
}

function onWarning(
  draft: Draft<ConversationControllerState>,
  event: WarningEvent
): void {
  draft.sideEffects.push({
    type: 'toast',
    variant: 'warning',
    title: 'Warning',
    description: event.message,
  });
}

function onError(
  draft: Draft<ConversationControllerState>,
  event: ErrorEvent,
  eventId: string,
  turnId: string,
  timestamp: string
): void {
  const entry: TranscriptErrorCell = {
    id: eventId,
    kind: 'error',
    timestamp,
    eventIds: [eventId],
    severity: 'error',
    message: event.message,
  };
  appendCell(draft, turnId, entry);
  draft.sideEffects.push({
    type: 'toast',
    variant: 'error',
    title: 'Error',
    description: event.message,
  });
}

function onStreamError(
  draft: Draft<ConversationControllerState>,
  event: StreamErrorEvent,
  eventId: string,
  turnId: string,
  timestamp: string
): void {
  const entry: TranscriptErrorCell = {
    id: eventId,
    kind: 'error',
    timestamp,
    eventIds: [eventId],
    severity: 'stream',
    message: event.message,
  };
  appendCell(draft, turnId, entry);
}

type EventApplicationContext = {
  execDecoders: Record<string, ExecStreamDecoders>;
};

function applyConversationEvent(
  draft: Draft<ConversationControllerState>,
  payload: ConversationEventPayload,
  context: EventApplicationContext
) {
  const { event, conversationId } = payload;

  if (event.type === 'item_started') {
    console.log(
      `[event] ${event.item.type}`,
      JSON.stringify(event.item).slice(0, 100)
    );
  } else if (!event.type.includes('delta')) {
    console.log(`[event] ${event.type}`, JSON.stringify(payload).slice(0, 100));
  }
  const turnId = payload.turnId ?? 'unknown-turn';
  const eventId = payload.eventId;
  const timestamp = now();
  const ingestOnDraft = (nextPayload: ConversationEventPayload) => {
    applyConversationEvent(draft, nextPayload, context);
  };

  switch (event.type) {
    case 'session_configured':
      onSessionConfigured(
        draft,
        event,
        conversationId,
        eventId,
        turnId,
        timestamp,
        ingestOnDraft
      );
      break;
    case 'user_message':
      onUserMessage(draft, event, eventId, turnId, timestamp);
      break;
    case 'agent_message_delta':
      onAgentMessageDelta(draft, event, eventId, turnId, timestamp);
      break;
    case 'agent_message':
      onAgentMessage(draft, event, eventId, turnId, timestamp, conversationId);
      break;
    case 'agent_reasoning_delta':
    case 'agent_reasoning_raw_content_delta':
      onAgentReasoningDelta(draft, event, eventId, turnId, timestamp);
      break;
    case 'agent_reasoning':
    case 'agent_reasoning_raw_content':
      onAgentReasoning(draft, event, eventId, turnId, timestamp);
      break;
    case 'agent_reasoning_section_break':
      onAgentReasoningSectionBreak(draft);
      break;
    case 'task_started':
      onTaskStarted(draft, turnId, timestamp);
      break;
    case 'task_complete':
      onTaskComplete(draft, event, eventId, turnId, timestamp);
      break;
    case 'turn_aborted':
      onTurnAborted(draft, event, eventId, turnId, timestamp);
      break;
    case 'background_event':
      onBackgroundEvent(draft, event, eventId, turnId, timestamp);
      break;
    case 'plan_update':
      onPlanUpdate(draft, event, eventId, turnId, timestamp);
      break;
    case 'token_count':
      onTokenCount(draft, event, eventId, timestamp);
      break;
    case 'turn_diff':
      onTurnDiff(draft, event, eventId, turnId, timestamp);
      break;
    case 'exec_command_begin':
      onExecCommandBegin(
        draft,
        event,
        eventId,
        turnId,
        timestamp,
        context.execDecoders
      );
      break;
    case 'exec_command_output_delta':
      onExecCommandOutputDelta(
        draft,
        event,
        eventId,
        turnId,
        context.execDecoders
      );
      break;
    case 'exec_command_end':
      onExecCommandEnd(
        draft,
        event,
        eventId,
        turnId,
        timestamp,
        context.execDecoders
      );
      break;
    case 'exec_approval_request':
      onExecApprovalRequest(draft, event, eventId, turnId, timestamp);
      break;
    case 'patch_apply_begin':
      onPatchApplyBegin(draft, event, eventId, turnId, timestamp);
      break;
    case 'patch_apply_end':
      onPatchApplyEnd(draft, event, eventId, turnId, timestamp);
      break;
    case 'read_thread_end':
      onReadThreadEnd(draft, event, eventId, turnId, timestamp);
      break;
    case 'apply_patch_approval_request':
      onPatchApprovalRequest(draft, event, eventId, turnId, timestamp);
      break;
    case 'mcp_tool_call_begin':
      onMcpToolCallBegin(draft, event, eventId, turnId, timestamp);
      break;
    case 'mcp_tool_call_end':
      onMcpToolCallEnd(draft, event, eventId, turnId, timestamp);
      break;
    case 'web_search_begin':
      onWebSearchBegin(draft, event, eventId, turnId, timestamp);
      break;
    case 'web_search_end':
      onWebSearchEnd(draft, event, eventId, turnId, timestamp);
      break;
    case 'view_image_tool_call':
      onViewImageToolCall(draft, event, eventId, turnId, timestamp);
      break;
    case 'warning':
      onWarning(draft, event);
      break;
    case 'error':
      onError(draft, event, eventId, turnId, timestamp);
      break;
    case 'stream_error':
      onStreamError(draft, event, eventId, turnId, timestamp);
      break;
    default:
      break;
  }
}

export type ConversationEventContext = EventApplicationContext;

export const ingestConversationEvent = (
  state: ConversationControllerState,
  payload: ConversationEventPayload,
  context: ConversationEventContext
): ConversationControllerState =>
  produce(state, (draft) => {
    applyConversationEvent(draft, payload, context);
  });

export const drainConversationSideEffects = (
  state: ConversationControllerState
): {
  nextState: ConversationControllerState;
  sideEffects: ConversationSideEffect[];
} => {
  let drained: ConversationSideEffect[] = [];
  const nextState = produce(state, (draft) => {
    drained = draft.sideEffects.slice();
    draft.sideEffects.splice(0);
  });
  return { nextState, sideEffects: drained };
};

export const getConversationEventsAsJsonl = (
  state: ConversationControllerState
): string =>
  state.ingestedEvents.map((event) => safeStringify(event)).join('\n');
