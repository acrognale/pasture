import { produce } from 'immer';
import type { Draft } from 'immer';
import type { AgentMessageDeltaEvent } from '~/codex.gen/AgentMessageDeltaEvent';
import type { AgentMessageEvent } from '~/codex.gen/AgentMessageEvent';
import type { AgentReasoningDeltaEvent } from '~/codex.gen/AgentReasoningDeltaEvent';
import type { AgentReasoningEvent } from '~/codex.gen/AgentReasoningEvent';
import type { AgentReasoningRawContentDeltaEvent } from '~/codex.gen/AgentReasoningRawContentDeltaEvent';
import type { AgentReasoningRawContentEvent } from '~/codex.gen/AgentReasoningRawContentEvent';
import type { ApplyPatchApprovalRequestEvent } from '~/codex.gen/ApplyPatchApprovalRequestEvent';
import type { BackgroundEventEvent } from '~/codex.gen/BackgroundEventEvent';
import type { ConversationEventPayload } from '~/codex.gen/ConversationEventPayload';
import type { ErrorEvent } from '~/codex.gen/ErrorEvent';
import type { ExecApprovalRequestEvent } from '~/codex.gen/ExecApprovalRequestEvent';
import type { ExecCommandBeginEvent } from '~/codex.gen/ExecCommandBeginEvent';
import type { ExecCommandEndEvent } from '~/codex.gen/ExecCommandEndEvent';
import type { ExecCommandOutputDeltaEvent } from '~/codex.gen/ExecCommandOutputDeltaEvent';
import type { McpToolCallBeginEvent } from '~/codex.gen/McpToolCallBeginEvent';
import type { McpToolCallEndEvent } from '~/codex.gen/McpToolCallEndEvent';
import type { PatchApplyBeginEvent } from '~/codex.gen/PatchApplyBeginEvent';
import type { PatchApplyEndEvent } from '~/codex.gen/PatchApplyEndEvent';
import type { RateLimitSnapshot } from '~/codex.gen/RateLimitSnapshot';
import type { ReasoningContentDeltaEvent } from '~/codex.gen/ReasoningContentDeltaEvent';
import type { ReasoningRawContentDeltaEvent } from '~/codex.gen/ReasoningRawContentDeltaEvent';
import type { ReasoningSummary } from '~/codex.gen/ReasoningSummary';
import type { SessionConfiguredEvent } from '~/codex.gen/SessionConfiguredEvent';
import type { StreamErrorEvent } from '~/codex.gen/StreamErrorEvent';
import type { TaskCompleteEvent } from '~/codex.gen/TaskCompleteEvent';
import type { TokenCountEvent } from '~/codex.gen/TokenCountEvent';
import type { TokenUsageInfo } from '~/codex.gen/TokenUsageInfo';
import type { TurnAbortedEvent } from '~/codex.gen/TurnAbortedEvent';
import type { TurnDiffEvent } from '~/codex.gen/TurnDiffEvent';
import type { UpdatePlanArgs } from '~/codex.gen/UpdatePlanArgs';
import type { UserMessageEvent } from '~/codex.gen/UserMessageEvent';
import type { ViewImageToolCallEvent } from '~/codex.gen/ViewImageToolCallEvent';
import type { WarningEvent } from '~/codex.gen/WarningEvent';
import type { WebSearchBeginEvent } from '~/codex.gen/WebSearchBeginEvent';
import type { WebSearchEndEvent } from '~/codex.gen/WebSearchEndEvent';
import { extractFirstBold } from '~/lib/markdown';
import { safeStringify } from '~/lib/utils';

import { makeKey } from '../transcript/indices';
import {
  findExecCellByCallId,
  findExplorationAnchor,
  findLatestTaskCell,
  findPatchCellByCallId,
  findToolCellByCallId,
} from '../transcript/selectors';
import { createInitialTranscriptState } from '../transcript/state';
import {
  type ExecStreamDecoders,
  type TranscriptAgentMessageCell,
  type TranscriptAgentReasoningCell,
  type TranscriptCell,
  type TranscriptErrorCell,
  type TranscriptExecApprovalCell,
  type TranscriptExecCommandCell,
  type TranscriptExplorationCall,
  type TranscriptPatchApprovalCell,
  type TranscriptPatchCell,
  type TranscriptPlanCell,
  type TranscriptSessionConfiguredCell,
  type TranscriptStatusCell,
  type TranscriptTaskCell,
  type TranscriptToolCell,
  type TranscriptTurnDiff,
  type TranscriptUserMessageCell,
} from '../transcript/types';
import type { TranscriptState } from '../transcript/types';
import {
  deriveReasoningSummaryFormat,
  hasReasoningBody,
  stripReasoningHeader,
} from '../transcript/utils/reasoning';
import { decodeBase64ToUint8Array } from '../transcript/utils/streams';
import { DEFAULT_STATUS_HEADER } from './constants';

/**
 * Unified conversation state combining transcript + runtime metadata.
 * This is the single source of truth for all conversation data.
 */
export type ConversationState = {
  /** The transcript containing all cells and their data */
  transcript: TranscriptState;

  /** Runtime metadata fields */
  activeTurnStartedAt: string | null;
  contextTokensInWindow: number | null;
  maxContextWindow: number | null;
  statusHeader: string;
  statusOverride: string | null;
  latestTurnDiff: TranscriptTurnDiff | null;
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
  sideEffects: ConversationSideEffect[];
  retryStatusHeader: string | null;
  reasoningBuffer: string;
  fullReasoningBuffer: string;
  tokenInfo: TokenUsageInfo | null;
  rateLimitSnapshot: RateLimitSnapshot | null;
  ingestedEvents: ConversationEventPayload[];
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
    activeTurnStartedAt: null,
    contextTokensInWindow: null,
    maxContextWindow: null,
    statusHeader: DEFAULT_STATUS_HEADER,
    statusOverride: null,
    latestTurnDiff: null,
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
  sideEffects: [],
  retryStatusHeader: null,
  reasoningBuffer: '',
  fullReasoningBuffer: '',
  tokenInfo: null,
  rateLimitSnapshot: null,
  ingestedEvents: [],
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

/**
 * Append a new transcript cell and return its index.
 *
 * Contract: `transcript.cells` is append-only and indices are stable for the
 * lifetime of a conversation. Callers may safely store indices in
 * `transcript.indices` or component state.
 */
function appendCell<T extends TranscriptCell>(
  state: Draft<ConversationControllerState>,
  cell: T
): number {
  // @ts-expect-error Immer Draft typing widens `cells` to Draft<TranscriptCell>[].
  // We intentionally treat it as a mutable TranscriptCell[]: cells are append-only
  // and indices are never reused, so pushing a new cell preserves all existing
  // references and index-based indices.
  const index = state.conversation.transcript.cells.push(cell) - 1;
  return index;
}

function appendEventId(
  state: ConversationControllerState,
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

function getOpenAgentCell(state: ConversationControllerState): {
  cell: TranscriptAgentMessageCell;
  index: number;
} | null {
  const index = state.conversation.transcript.openAgentMessageCellIndex;
  if (index == null) {
    return null;
  }
  const cell = state.conversation.transcript.cells[index];
  if (!cell || cell.kind !== 'agent-message') {
    return null;
  }
  return { cell, index };
}

function closeActiveAgentCell(state: ConversationControllerState) {
  const open = getOpenAgentCell(state);
  if (open) {
    open.cell.streaming = false;
  }
  state.conversation.transcript.openAgentMessageCellIndex = null;
}

function appendAgentDelta(
  state: ConversationControllerState,
  delta: string,
  timestamp: string,
  eventId: string
) {
  if (!delta) {
    return;
  }
  const open = getOpenAgentCell(state);
  if (open) {
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
  const index = appendCell(state, entry);
  state.conversation.transcript.openAgentMessageCellIndex = index;
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

function onSessionConfigured(
  draft: Draft<ConversationControllerState>,
  event: SessionConfiguredEvent,
  conversationId: string,
  eventId: string,
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
  appendCell(draft, entry);
  draft.conversation.transcript.reasoningSummaryFormat =
    deriveReasoningSummaryFormat(event.model);
  const preference = draft.conversation.reasoningSummaryPreference;
  if (preference) {
    draft.conversation.reasoningSummaryPreference = preference;
    draft.conversation.transcript.reasoningSummaryFormat =
      preference === 'none' ? 'none' : 'experimental';
  }
  // Historical transcript events are replayed via Codex.initializeConversation.
  // Streaming session_configured events intentionally skip initial_messages to avoid
  // duplicating the RPC response when windows reconnect.
}

function onUserMessage(
  draft: Draft<ConversationControllerState>,
  event: UserMessageEvent,
  eventId: string,
  timestamp: string
): void {
  const transcript = draft.conversation.transcript;
  const images = event.images && event.images.length > 0 ? event.images : null;

  let index = transcript.openUserMessageCellIndex;
  const existing = index != null ? transcript.cells[index] : undefined;

  if (!existing || existing.kind !== 'user-message') {
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
    index = appendCell(draft, entry);
  } else {
    existing.message = event.message;
    existing.images = images;
    existing.timestamp = timestamp;
    appendEventId(draft, existing, eventId);
  }

  transcript.openUserMessageCellIndex = index;
  transcript.latestTurnDiff = null;
  closeActiveAgentCell(draft);
  transcript.shouldBreakExecGroup = true;
}

function onAgentMessageDelta(
  draft: Draft<ConversationControllerState>,
  event: AgentMessageDeltaEvent,
  eventId: string,
  timestamp: string
): void {
  appendAgentDelta(draft, event.delta, timestamp, eventId);
}

function onAgentMessage(
  draft: Draft<ConversationControllerState>,
  event: AgentMessageEvent,
  eventId: string,
  timestamp: string
): void {
  const open = getOpenAgentCell(draft);
  if (open) {
    open.cell.message = event.message;
    appendEventId(draft, open.cell, eventId);
    closeActiveAgentCell(draft);
    draft.conversation.transcript.openUserMessageCellIndex = null;
    return;
  }
  const entry: TranscriptAgentMessageCell = {
    id: eventId,
    kind: 'agent-message',
    timestamp,
    eventIds: [eventId],
    message: event.message,
    streaming: false,
    itemId: null,
  };
  appendCell(draft, entry);
  draft.conversation.transcript.openUserMessageCellIndex = null;
}

function onAgentReasoningDelta(
  draft: Draft<ConversationControllerState>,
  event:
    | AgentReasoningDeltaEvent
    | AgentReasoningRawContentDeltaEvent
    | ReasoningContentDeltaEvent
    | ReasoningRawContentDeltaEvent,
  _eventId: string,
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
}

function onAgentReasoning(
  draft: Draft<ConversationControllerState>,
  event: AgentReasoningEvent | AgentReasoningRawContentEvent,
  eventId: string,
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
  appendCell(draft, entry);
  draft.reasoningBuffer = '';
  draft.fullReasoningBuffer = '';
  draft.conversation.transcript.pendingReasoningText = null;
  draft.conversation.transcript.latestReasoningHeader = null;
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
  timestamp: string,
  execDecoders: Record<string, ExecStreamDecoders>
): void {
  const transcript = draft.conversation.transcript;
  const isExploration = isExplorationParsed(event.parsed_cmd);

  if (!transcript.shouldBreakExecGroup && isExploration) {
    const anchor = findExplorationAnchor(transcript);
    if (anchor?.cell.exploration) {
      anchor.cell.exploration.calls = [
        ...anchor.cell.exploration.calls,
        createExplorationCall(event),
      ];
      anchor.cell.callId = event.call_id;
      anchor.cell.status = 'running';
      anchor.cell.streaming = true;
      appendEventId(draft, anchor.cell, eventId);
      transcript.indices.execByCallId[event.call_id] = anchor.index;
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
  const index = appendCell(draft, cell);
  transcript.indices.execByCallId[event.call_id] = index;
  ensureExecDecoders(execDecoders, event.call_id);
}

function onExecCommandOutputDelta(
  draft: Draft<ConversationControllerState>,
  event: ExecCommandOutputDeltaEvent,
  eventId: string,
  execDecoders: Record<string, ExecStreamDecoders>
): void {
  const transcript = draft.conversation.transcript;
  const target = findExecCellByCallId(transcript, event.call_id);
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
}

function onExecCommandEnd(
  draft: Draft<ConversationControllerState>,
  event: ExecCommandEndEvent,
  eventId: string,
  timestamp: string,
  execDecoders: Record<string, ExecStreamDecoders>
): void {
  const transcript = draft.conversation.transcript;
  const target = findExecCellByCallId(transcript, event.call_id);

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
    transcript.indices.execByCallId[event.call_id] = target.index;
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
    const index = appendCell(draft, cell);
    transcript.indices.execByCallId[event.call_id] = index;
  }

  removeExecDecoders(execDecoders, event.call_id);
}

function onTaskStarted(
  draft: Draft<ConversationControllerState>,
  timestamp: string
): void {
  const transcript = draft.conversation.transcript;
  transcript.pendingTaskStartedAt = timestamp;
  transcript.pendingReasoningText = null;
  transcript.latestReasoningHeader = null;
  transcript.latestTurnDiff = null;
  transcript.turnCounter += 1;
  transcript.activeTurnNumber = transcript.turnCounter;
  draft.conversation.activeTurnStartedAt = timestamp;
  draft.conversation.statusHeader = 'Processing...';
  draft.conversation.latestTurnDiff = null;
}

function onTaskComplete(
  draft: Draft<ConversationControllerState>,
  event: TaskCompleteEvent,
  eventId: string,
  timestamp: string
): void {
  closeActiveAgentCell(draft);
  const transcript = draft.conversation.transcript;
  const target = findLatestTaskCell(transcript);
  if (target && target.cell.status === 'started') {
    target.cell.status = 'complete';
    target.cell.lastAgentMessage = event.last_agent_message ?? null;
    target.cell.startedAt =
      target.cell.startedAt ?? transcript.pendingTaskStartedAt ?? null;
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
      startedAt: transcript.pendingTaskStartedAt ?? null,
    };
    appendCell(draft, cell);
  }
  transcript.pendingTaskStartedAt = null;
  transcript.activeTurnNumber = null;
  transcript.shouldBreakExecGroup = true;
  transcript.openUserMessageCellIndex = null;
  draft.conversation.activeTurnStartedAt = null;
  draft.conversation.statusHeader = DEFAULT_STATUS_HEADER;
}

function onPlanUpdate(
  draft: Draft<ConversationControllerState>,
  event: UpdatePlanArgs,
  eventId: string,
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
  appendCell(draft, entry);
}

function onTurnAborted(
  draft: Draft<ConversationControllerState>,
  event: TurnAbortedEvent,
  eventId: string,
  timestamp: string
): void {
  const transcript = draft.conversation.transcript;
  transcript.cells.forEach((cell) => {
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

  const entry: TranscriptStatusCell = {
    id: eventId,
    kind: 'status',
    timestamp,
    eventIds: [eventId],
    statusType: 'turn-aborted',
    summary: `Turn aborted: ${event.reason}`,
    data: event,
  };
  appendCell(draft, entry);
  transcript.pendingReasoningText = null;
  transcript.latestReasoningHeader = null;
  transcript.latestTurnDiff = null;
  transcript.activeTurnNumber = null;
  transcript.openUserMessageCellIndex = null;
  transcript.shouldBreakExecGroup = true;
  draft.conversation.activeTurnStartedAt = null;
  draft.conversation.statusHeader = DEFAULT_STATUS_HEADER;
  closeActiveAgentCell(draft);
}

function onBackgroundEvent(
  draft: Draft<ConversationControllerState>,
  event: BackgroundEventEvent,
  eventId: string,
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
  appendCell(draft, entry);
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
  timestamp: string
): void {
  const transcript = draft.conversation.transcript;
  const history = transcript.turnDiffHistory;
  const turnNumber = (() => {
    if (transcript.activeTurnNumber != null) {
      return transcript.activeTurnNumber;
    }
    if (history.length > 0) {
      return history[history.length - 1].turnNumber + 1;
    }
    if (transcript.turnCounter > 0) {
      return transcript.turnCounter + 1;
    }
    return 1;
  })();

  const entry: TranscriptTurnDiff = {
    eventId,
    timestamp,
    unifiedDiff: event.unified_diff ?? '',
    turnNumber,
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
  transcript.turnCounter = Math.max(transcript.turnCounter, turnNumber);
  transcript.activeTurnNumber = turnNumber;
  draft.conversation.latestTurnDiff = entry;
}

function onExecApprovalRequest(
  draft: Draft<ConversationControllerState>,
  event: ExecApprovalRequestEvent,
  eventId: string,
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
  appendCell(draft, entry);
}

function onPatchApplyBegin(
  draft: Draft<ConversationControllerState>,
  event: PatchApplyBeginEvent,
  eventId: string,
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
  const index = appendCell(draft, cell);
  draft.conversation.transcript.indices.patchByCallId[event.call_id] = index;
}

function onPatchApplyEnd(
  draft: Draft<ConversationControllerState>,
  event: PatchApplyEndEvent,
  eventId: string,
  timestamp: string
): void {
  const transcript = draft.conversation.transcript;
  const target = findPatchCellByCallId(transcript, event.call_id);
  if (target) {
    target.cell.status = event.success ? 'succeeded' : 'failed';
    target.cell.stdout = event.stdout;
    target.cell.stderr = event.stderr;
    target.cell.success = event.success;
    appendEventId(draft, target.cell, eventId);
    draft.conversation.transcript.indices.patchByCallId[event.call_id] =
      target.index;
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
  const index = appendCell(draft, cell);
  draft.conversation.transcript.indices.patchByCallId[event.call_id] = index;
}

function onPatchApprovalRequest(
  draft: Draft<ConversationControllerState>,
  event: ApplyPatchApprovalRequestEvent,
  eventId: string,
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
  appendCell(draft, entry);
}

function onMcpToolCallBegin(
  draft: Draft<ConversationControllerState>,
  event: McpToolCallBeginEvent,
  eventId: string,
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
  const index = appendCell(draft, cell);
  draft.conversation.transcript.indices.toolByTypeAndCallId[
    makeKey('mcp', event.call_id)
  ] = index;
}

function onMcpToolCallEnd(
  draft: Draft<ConversationControllerState>,
  event: McpToolCallEndEvent,
  eventId: string,
  timestamp: string
): void {
  const transcript = draft.conversation.transcript;
  const target = findToolCellByCallId(transcript, 'mcp', event.call_id);
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
    draft.conversation.transcript.indices.toolByTypeAndCallId[
      makeKey('mcp', event.call_id)
    ] = target.index;
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
  const index = appendCell(draft, cell);
  draft.conversation.transcript.indices.toolByTypeAndCallId[
    makeKey('mcp', event.call_id)
  ] = index;
}

function onWebSearchBegin(
  draft: Draft<ConversationControllerState>,
  event: WebSearchBeginEvent,
  eventId: string,
  timestamp: string
): void {
  const transcript = draft.conversation.transcript;
  const target = findToolCellByCallId(transcript, 'web-search', event.call_id);
  if (target) {
    target.cell.status = 'running';
    target.cell.callId = event.call_id;
    appendEventId(draft, target.cell, eventId);
    draft.conversation.transcript.indices.toolByTypeAndCallId[
      makeKey('web-search', event.call_id)
    ] = target.index;
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
  const index = appendCell(draft, cell);
  draft.conversation.transcript.indices.toolByTypeAndCallId[
    makeKey('web-search', event.call_id)
  ] = index;
}

function onWebSearchEnd(
  draft: Draft<ConversationControllerState>,
  event: WebSearchEndEvent,
  eventId: string,
  timestamp: string
): void {
  const transcript = draft.conversation.transcript;
  const target = findToolCellByCallId(transcript, 'web-search', event.call_id);
  if (target) {
    target.cell.status = 'succeeded';
    target.cell.callId = event.call_id;
    target.cell.itemId = event.call_id;
    target.cell.query = event.query;
    appendEventId(draft, target.cell, eventId);
    draft.conversation.transcript.indices.toolByTypeAndCallId[
      makeKey('web-search', event.call_id)
    ] = target.index;
    draft.conversation.transcript.indices.itemById[event.call_id] =
      target.index;
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
  const index = appendCell(draft, cell);
  draft.conversation.transcript.indices.toolByTypeAndCallId[
    makeKey('web-search', event.call_id)
  ] = index;
  draft.conversation.transcript.indices.itemById[event.call_id] = index;
}

function onViewImageToolCall(
  draft: Draft<ConversationControllerState>,
  event: ViewImageToolCallEvent,
  eventId: string,
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
  const index = appendCell(draft, cell);
  draft.conversation.transcript.indices.toolByTypeAndCallId[
    makeKey('view-image', event.call_id)
  ] = index;
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
  appendCell(draft, entry);
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
  appendCell(draft, entry);
}

type EventApplicationContext = {
  execDecoders: Record<string, ExecStreamDecoders>;
};

function applyConversationEvent(
  draft: Draft<ConversationControllerState>,
  payload: ConversationEventPayload,
  context: EventApplicationContext
) {
  const { event, eventId, conversationId } = payload;
  const timestamp = now();
  const ingestOnDraft = (nextPayload: ConversationEventPayload) => {
    if (import.meta.env.DEV) {
      draft.ingestedEvents.push(nextPayload);
    }
    applyConversationEvent(draft, nextPayload, context);
  };

  switch (event.type) {
    case 'session_configured':
      onSessionConfigured(
        draft,
        event,
        conversationId,
        eventId,
        timestamp,
        ingestOnDraft
      );
      break;
    case 'user_message':
      onUserMessage(draft, event, eventId, timestamp);
      break;
    case 'agent_message_delta':
      onAgentMessageDelta(draft, event, eventId, timestamp);
      break;
    case 'agent_message':
      onAgentMessage(draft, event, eventId, timestamp);
      break;
    case 'agent_reasoning_delta':
    case 'agent_reasoning_raw_content_delta':
      onAgentReasoningDelta(draft, event, eventId, timestamp);
      break;
    case 'agent_reasoning':
    case 'agent_reasoning_raw_content':
      onAgentReasoning(draft, event, eventId, timestamp);
      break;
    case 'agent_reasoning_section_break':
      onAgentReasoningSectionBreak(draft);
      break;
    case 'task_started':
      onTaskStarted(draft, timestamp);
      break;
    case 'task_complete':
      onTaskComplete(draft, event, eventId, timestamp);
      break;
    case 'turn_aborted':
      onTurnAborted(draft, event, eventId, timestamp);
      break;
    case 'background_event':
      onBackgroundEvent(draft, event, eventId, timestamp);
      break;
    case 'plan_update':
      onPlanUpdate(draft, event, eventId, timestamp);
      break;
    case 'token_count':
      onTokenCount(draft, event, eventId, timestamp);
      break;
    case 'turn_diff':
      onTurnDiff(draft, event, eventId, timestamp);
      break;
    case 'exec_command_begin':
      onExecCommandBegin(
        draft,
        event,
        eventId,
        timestamp,
        context.execDecoders
      );
      break;
    case 'exec_command_output_delta':
      onExecCommandOutputDelta(draft, event, eventId, context.execDecoders);
      break;
    case 'exec_command_end':
      onExecCommandEnd(draft, event, eventId, timestamp, context.execDecoders);
      break;
    case 'exec_approval_request':
      onExecApprovalRequest(draft, event, eventId, timestamp);
      break;
    case 'patch_apply_begin':
      onPatchApplyBegin(draft, event, eventId, timestamp);
      break;
    case 'patch_apply_end':
      onPatchApplyEnd(draft, event, eventId, timestamp);
      break;
    case 'apply_patch_approval_request':
      onPatchApprovalRequest(draft, event, eventId, timestamp);
      break;
    case 'mcp_tool_call_begin':
      onMcpToolCallBegin(draft, event, eventId, timestamp);
      break;
    case 'mcp_tool_call_end':
      onMcpToolCallEnd(draft, event, eventId, timestamp);
      break;
    case 'web_search_begin':
      onWebSearchBegin(draft, event, eventId, timestamp);
      break;
    case 'web_search_end':
      onWebSearchEnd(draft, event, eventId, timestamp);
      break;
    case 'view_image_tool_call':
      onViewImageToolCall(draft, event, eventId, timestamp);
      break;
    case 'warning':
      onWarning(draft, event);
      break;
    case 'error':
      onError(draft, event, eventId, timestamp);
      break;
    case 'stream_error':
      onStreamError(draft, event, eventId, timestamp);
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
    if (import.meta.env.DEV) {
      // @ts-expect-error Immer Draft typing widens `cells` to Draft<TranscriptCell>[].
      draft.ingestedEvents.push(payload);
    }
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
