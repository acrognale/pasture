import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConversationEventPayload } from '~/codex.gen/ConversationEventPayload';
import type { EventMsg } from '~/codex.gen/EventMsg';
import type { ParsedCommand } from '~/codex.gen/ParsedCommand';
import type { ConversationControllerState } from '~/conversation/store/reducer';
import { createConversationStore } from '~/conversation/store/store';

import type {
  TranscriptAgentReasoningCell,
  TranscriptExecCommandCell,
  TranscriptPlanCell,
  TranscriptTaskCell,
  TranscriptToolCell,
  TranscriptUserMessageCell,
} from '../types';

type ExecBeginEvent = Extract<EventMsg, { type: 'exec_command_begin' }>;
type ExecEndEvent = Extract<EventMsg, { type: 'exec_command_end' }>;
type ExecOutputDeltaEvent = Extract<
  EventMsg,
  { type: 'exec_command_output_delta' }
>;
type TurnDiffEvent = Extract<EventMsg, { type: 'turn_diff' }>;
const ts = (n: number) => {
  const seconds = `${n}`.padStart(2, '0');
  return `2024-05-01T12:00:${seconds}.000Z`;
};
const toBase64 = (text: string) => Buffer.from(text, 'utf8').toString('base64');

const TEST_CONVERSATION_ID = 'conversation-1';

type TestController = {
  ingest: (payload: ConversationEventPayload) => void;
  readonly conversation: ConversationControllerState['conversation'];
};

const createTestController = (): TestController => {
  const store = createConversationStore({
    conversationId: TEST_CONVERSATION_ID,
  });
  return {
    ingest: (payload) => store.getState().ingestEvent(payload),
    get conversation() {
      return store.getState().conversation;
    },
  };
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const searchCommand = (query: string): ParsedCommand => ({
  type: 'search',
  cmd: `search ${query}`,
  query,
  path: null,
});

const readCommand = (path: string): ParsedCommand => ({
  type: 'read',
  cmd: `read ${path}`,
  name: path,
  path,
});

const listFilesCommand = (path: string): ParsedCommand => ({
  type: 'list_files',
  cmd: `ls ${path}`,
  path,
});

const makeReasoningText = (
  summaryText: string[],
  rawContent: string[] = []
): string => [...summaryText, ...rawContent].join('\n');

const agentReasoningEvent = (text: string): EventMsg => ({
  type: 'agent_reasoning',
  text,
});

const agentMessageEvent = (message: string): EventMsg => ({
  type: 'agent_message',
  message,
});

type ExecBeginEventInput = Omit<
  ExecBeginEvent,
  'type' | 'is_user_shell_command'
> & {
  is_user_shell_command?: boolean;
};

const execBeginEvent = (params: ExecBeginEventInput): ExecBeginEvent => ({
  type: 'exec_command_begin',
  is_user_shell_command: false,
  ...params,
});

const sessionConfigured = (model: string): EventMsg => ({
  type: 'session_configured',
  session_id: 'session-1',
  model,
  reasoning_effort: null,
  history_log_id: 0n,
  history_entry_count: 0,
  initial_messages: null,
  rollout_path: '/tmp/rollout.jsonl',
});

const applyEvent = (
  controller: TestController,
  event: EventMsg,
  eventId: string,
  index: number
) => {
  const timestamp = ts(index);
  vi.setSystemTime(new Date(timestamp));

  controller.ingest({
    conversationId: TEST_CONVERSATION_ID,
    eventId,
    event,
    timestamp,
  });

  return controller.conversation.transcript;
};

const describeKind = (value: unknown): string =>
  typeof value === 'string' ? value : 'unknown';

const expectExecCell = (cell: unknown): TranscriptExecCommandCell => {
  if (!cell || typeof cell !== 'object') {
    throw new Error('Expected transcript cell');
  }

  const execCell = cell as { kind?: unknown };
  if (execCell.kind !== 'exec') {
    throw new Error(
      `Expected exec cell, received "${describeKind(execCell.kind)}"`
    );
  }

  return cell as TranscriptExecCommandCell;
};

const expectPlanCell = (cell: unknown): TranscriptPlanCell => {
  if (!cell || typeof cell !== 'object') {
    throw new Error('Expected transcript cell');
  }

  const planCell = cell as { kind?: unknown };
  if (planCell.kind !== 'plan') {
    throw new Error(
      `Expected plan cell, received "${describeKind(planCell.kind)}"`
    );
  }

  return cell as TranscriptPlanCell;
};

const expectTaskCell = (cell: unknown): TranscriptTaskCell => {
  if (!cell || typeof cell !== 'object') {
    throw new Error('Expected transcript cell');
  }

  const taskCell = cell as { kind?: unknown };
  if (taskCell.kind !== 'task') {
    throw new Error(
      `Expected task cell, received "${describeKind(taskCell.kind)}"`
    );
  }

  return cell as TranscriptTaskCell;
};

const expectUserCell = (cell: unknown): TranscriptUserMessageCell => {
  if (!cell || typeof cell !== 'object') {
    throw new Error('Expected transcript cell');
  }

  const userCell = cell as { kind?: unknown };
  if (userCell.kind !== 'user-message') {
    throw new Error(
      `Expected user-message cell, received "${describeKind(userCell.kind)}"`
    );
  }

  return cell as TranscriptUserMessageCell;
};

describe('reasoning summary format', () => {
  it('derives experimental format for codex-family models', () => {
    const controller = createTestController();
    let state = controller.conversation.transcript;

    state = applyEvent(
      controller,
      sessionConfigured('gpt-5-codex-latest'),
      'sc1',
      1
    );

    expect(state.reasoningSummaryFormat).toBe('experimental');
  });

  it('hides reasoning summaries when format is none', () => {
    const controller = createTestController();
    let state = controller.conversation.transcript;

    state = applyEvent(controller, sessionConfigured('gpt-5'), 'sc-none', 1);
    const reasoningText = makeReasoningText(
      ['**Plan**', 'Step 1'],
      ['Additional detail']
    );
    state = applyEvent(
      controller,
      agentReasoningEvent(reasoningText),
      'rs-1',
      2
    );

    const reasoningCells = state.cells.filter(
      (cell): cell is TranscriptAgentReasoningCell =>
        (cell as { kind?: unknown }).kind === 'agent-reasoning'
    );

    expect(reasoningCells).toHaveLength(1);
    expect(reasoningCells[0]?.visible).toBe(false);
    expect(state.latestReasoningHeader).toBeNull();
  });

  it('shows reasoning summaries when format is experimental', () => {
    const controller = createTestController();
    let state = controller.conversation.transcript;

    state = applyEvent(
      controller,
      sessionConfigured('test-gpt-5-codex-experimental'),
      'sc-exp',
      1
    );
    const reasoningText = makeReasoningText(
      ['**Plan**', 'Step 1'],
      ['Additional detail']
    );
    state = applyEvent(
      controller,
      agentReasoningEvent(reasoningText),
      're-1',
      2
    );

    const reasoningCells = state.cells.filter(
      (cell): cell is TranscriptAgentReasoningCell =>
        (cell as { kind?: unknown }).kind === 'agent-reasoning'
    );

    expect(reasoningCells).toHaveLength(1);
    expect(reasoningCells[0]?.visible).toBe(true);
  });
});

describe('turn diff handling', () => {
  it('tracks the latest diff and clears it when a new user message arrives', () => {
    const controller = createTestController();
    let state = controller.conversation.transcript;

    const firstDiff: TurnDiffEvent = {
      type: 'turn_diff',
      unified_diff:
        'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-Hello\n+Hello world\n',
    };

    state = applyEvent(controller, firstDiff, 'diff-1', 1);

    expect(state.latestTurnDiff).toEqual({
      eventId: 'diff-1',
      timestamp: ts(1),
      unifiedDiff: firstDiff.unified_diff,
      turnNumber: 1,
    });

    const nextTurnStarted: EventMsg = {
      type: 'task_started',
      model_context_window: null,
    };

    state = applyEvent(controller, nextTurnStarted, 'task-2', 2);

    const secondDiff: TurnDiffEvent = {
      type: 'turn_diff',
      unified_diff:
        'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-Hello world\n+Hello world!!!\n',
    };

    state = applyEvent(controller, secondDiff, 'diff-2', 3);

    expect(state.latestTurnDiff).toEqual({
      eventId: 'diff-2',
      timestamp: ts(3),
      unifiedDiff: secondDiff.unified_diff,
      turnNumber: 2,
    });

    const userMessage: EventMsg = {
      type: 'user_message',
      message: 'Start a fresh turn',
      images: null,
    };

    state = applyEvent(controller, userMessage, 'user-1', 4);

    expect(state.latestTurnDiff).toBeNull();
    expect(state.turnDiffHistory).toHaveLength(2);
    expect(state.turnDiffHistory.map((entry) => entry.turnNumber)).toEqual([
      1, 2,
    ]);
  });
});

describe('web search integration', () => {
  it('creates a single cell across begin/end events', () => {
    const controller = createTestController();
    let state = controller.conversation.transcript;

    state = applyEvent(
      controller,
      { type: 'web_search_begin', call_id: 'search-1' },
      'ws-begin',
      1
    );

    state = applyEvent(
      controller,
      { type: 'web_search_end', call_id: 'search-1', query: 'find docs' },
      'ws-end',
      4
    );

    const webSearchCells = state.cells.filter(
      (cell): cell is TranscriptToolCell =>
        (cell as { kind?: unknown }).kind === 'tool' &&
        (cell as { toolType?: unknown }).toolType === 'web-search'
    );

    expect(webSearchCells).toHaveLength(1);
    const cell = webSearchCells[0];
    expect(cell?.status).toBe('succeeded');
    expect(cell?.callId).toBe('search-1');
    expect(cell?.itemId).toBe('search-1');
    expect(cell?.query).toBe('find docs');
  });
});

describe('exploration exec grouping', () => {
  it('keeps exploration grouping when reasoning summaries are hidden', () => {
    const controller = createTestController();
    let state = controller.conversation.transcript;

    state = applyEvent(controller, sessionConfigured('gpt-5'), 'sc-hidden', 0);

    const firstBegin = execBeginEvent({
      call_id: 'c-hidden-1',
      command: ['search', 'package.json'],
      cwd: '/w',
      parsed_cmd: [searchCommand('package.json')],
    });
    state = applyEvent(controller, firstBegin, 'hidden-1', 1);

    const firstEnd: ExecEndEvent = {
      type: 'exec_command_end',
      call_id: 'c-hidden-1',
      exit_code: 0,
      stdout: '',
      stderr: '',
      aggregated_output: '',
      formatted_output: '',
      duration: '5ms',
    };
    state = applyEvent(controller, firstEnd, 'hidden-2', 2);

    const reasoningText = makeReasoningText(
      ['**Plan**', 'Step 1'],
      ['Detailed trace']
    );
    state = applyEvent(
      controller,
      agentReasoningEvent(reasoningText),
      'hidden-3',
      3
    );

    const secondBegin = execBeginEvent({
      call_id: 'c-hidden-2',
      command: ['read', 'src/index.ts'],
      cwd: '/w',
      parsed_cmd: [readCommand('src/index.ts')],
    });
    state = applyEvent(controller, secondBegin, 'hidden-5', 5);

    const secondEnd: ExecEndEvent = {
      type: 'exec_command_end',
      call_id: 'c-hidden-2',
      exit_code: 0,
      stdout: '',
      stderr: '',
      aggregated_output: '',
      formatted_output: '',
      duration: '6ms',
    };
    state = applyEvent(controller, secondEnd, 'hidden-6', 6);

    const execCells = state.cells
      .filter((cell) => (cell as { kind?: unknown }).kind === 'exec')
      .map(expectExecCell);

    expect(execCells).toHaveLength(1);
    expect(execCells[0]?.exploration?.calls.map((call) => call.callId)).toEqual(
      ['c-hidden-1', 'c-hidden-2']
    );
  });

  it('accumulates multiple exploration calls into one cell', () => {
    const controller = createTestController();
    let state = controller.conversation.transcript;

    // begin #1 (search)
    const searchBegin = execBeginEvent({
      call_id: 'c1',
      command: ['search', 'TokenUsageInfo'],
      cwd: '/w',
      parsed_cmd: [searchCommand('TokenUsageInfo')],
    });
    state = applyEvent(controller, searchBegin, 'e1', 1);

    // end #1
    const searchEnd: ExecEndEvent = {
      type: 'exec_command_end',
      call_id: 'c1',
      exit_code: 0,
      stdout: '',
      stderr: '',
      aggregated_output: '',
      formatted_output: '',
      duration: '10ms',
    };
    state = applyEvent(controller, searchEnd, 'e2', 2);

    // begin #2 (read)
    const readBegin = execBeginEvent({
      call_id: 'c2',
      command: ['read', 'src/foo.ts'],
      cwd: '/w',
      parsed_cmd: [readCommand('src/foo.ts')],
    });
    state = applyEvent(controller, readBegin, 'e3', 3);

    // end #2
    const readEnd: ExecEndEvent = {
      type: 'exec_command_end',
      call_id: 'c2',
      exit_code: 0,
      stdout: '',
      stderr: '',
      aggregated_output: '',
      formatted_output: '',
      duration: '8ms',
    };
    state = applyEvent(controller, readEnd, 'e4', 4);

    expect(state.cells).toHaveLength(1);
    const cell = expectExecCell(state.cells[0]);
    const exploration = cell.exploration;
    expect(exploration).not.toBeNull();
    if (!exploration) {
      throw new Error('Expected exploration data');
    }
    expect(exploration.calls).toHaveLength(2);
    expect(cell.status).toBe('succeeded');
  });

  it('does not clear outputs when a new exploration call begins', () => {
    const controller = createTestController();
    let state = controller.conversation.transcript;

    const firstBegin = execBeginEvent({
      call_id: 'c1',
      command: ['search', 'foo'],
      cwd: '/w',
      parsed_cmd: [searchCommand('foo')],
    });
    state = applyEvent(controller, firstBegin, 'e1', 1);

    const outputDelta: ExecOutputDeltaEvent = {
      type: 'exec_command_output_delta',
      call_id: 'c1',
      stream: 'stdout',
      chunk: toBase64('results...'),
    };
    state = applyEvent(controller, outputDelta, 'e2', 2);

    const before = expectExecCell(state.cells[0]);
    expect(before.outputChunks).toHaveLength(1);
    expect(before.stdout).toBe('results...');
    expect(before.aggregatedOutput).toBe('results...');

    // begin #2 (read) should NOT reset outputChunks now
    const secondBegin = execBeginEvent({
      call_id: 'c2',
      command: ['read', 'bar.ts'],
      cwd: '/w',
      parsed_cmd: [readCommand('bar.ts')],
    });
    state = applyEvent(controller, secondBegin, 'e3', 3);

    const after = expectExecCell(state.cells[0]);
    expect(after.outputChunks).toHaveLength(1);
  });

  it('decodes streaming exec output chunks delivered as base64', () => {
    const controller = createTestController();
    let state = controller.conversation.transcript;

    const begin = execBeginEvent({
      call_id: 'call-1',
      command: ['echo', 'hello'],
      cwd: '/tmp',
      parsed_cmd: [],
    });
    state = applyEvent(controller, begin, 'e1', 1);

    const stdout1: ExecOutputDeltaEvent = {
      type: 'exec_command_output_delta',
      call_id: 'call-1',
      stream: 'stdout',
      chunk: toBase64('hello'),
    };
    state = applyEvent(controller, stdout1, 'e2', 2);

    const stdout2: ExecOutputDeltaEvent = {
      type: 'exec_command_output_delta',
      call_id: 'call-1',
      stream: 'stdout',
      chunk: toBase64(' world'),
    };
    state = applyEvent(controller, stdout2, 'e3', 3);

    const stderr: ExecOutputDeltaEvent = {
      type: 'exec_command_output_delta',
      call_id: 'call-1',
      stream: 'stderr',
      chunk: toBase64('error'),
    };
    state = applyEvent(controller, stderr, 'e4', 4);

    const cell = expectExecCell(state.cells[0]);
    expect(cell.stdout).toBe('hello world');
    expect(cell.stderr).toBe('error');
    expect(cell.aggregatedOutput).toBe('hello worlderror');
    expect(cell.outputChunks).toEqual([
      { stream: 'stdout', chunk: 'hello' },
      { stream: 'stdout', chunk: ' world' },
      { stream: 'stderr', chunk: 'error' },
    ]);
  });

  it('does not mark entire cell as failed when a single exploration call fails', () => {
    const controller = createTestController();
    let state = controller.conversation.transcript;

    // begin #1 (search) - will succeed
    const firstBegin = execBeginEvent({
      call_id: 'c1',
      command: ['search', 'foo'],
      cwd: '/w',
      parsed_cmd: [searchCommand('foo')],
    });
    state = applyEvent(controller, firstBegin, 'e1', 1);

    // end #1 - success
    const firstEnd: ExecEndEvent = {
      type: 'exec_command_end',
      call_id: 'c1',
      exit_code: 0,
      stdout: 'results...',
      stderr: '',
      aggregated_output: 'results...',
      formatted_output: 'results...',
      duration: '10ms',
    };
    state = applyEvent(controller, firstEnd, 'e2', 2);

    // begin #2 (read) - will fail
    const secondBegin = execBeginEvent({
      call_id: 'c2',
      command: ['read', 'nonexistent.ts'],
      cwd: '/w',
      parsed_cmd: [readCommand('nonexistent.ts')],
    });
    state = applyEvent(controller, secondBegin, 'e3', 3);

    // end #2 - failure
    const secondEnd: ExecEndEvent = {
      type: 'exec_command_end',
      call_id: 'c2',
      exit_code: 1,
      stdout: '',
      stderr: 'file not found',
      aggregated_output: 'file not found',
      formatted_output: 'file not found',
      duration: '5ms',
    };
    state = applyEvent(controller, secondEnd, 'e4', 4);

    // begin #3 (list_files) - will succeed
    const thirdBegin = execBeginEvent({
      call_id: 'c3',
      command: ['ls', 'src/'],
      cwd: '/w',
      parsed_cmd: [listFilesCommand('src/')],
    });
    state = applyEvent(controller, thirdBegin, 'e5', 5);

    // end #3 - success
    const thirdEnd: ExecEndEvent = {
      type: 'exec_command_end',
      call_id: 'c3',
      exit_code: 0,
      stdout: 'src/foo.ts',
      stderr: '',
      aggregated_output: 'src/foo.ts',
      formatted_output: 'src/foo.ts',
      duration: '3ms',
    };
    state = applyEvent(controller, thirdEnd, 'e6', 6);

    expect(state.cells).toHaveLength(1);
    const cell = expectExecCell(state.cells[0]);
    const exploration = cell.exploration;
    expect(exploration).not.toBeNull();
    if (!exploration) {
      throw new Error('Expected exploration data');
    }
    expect(exploration.calls).toHaveLength(3);
    expect(exploration.calls[1]?.status).toBe('failed');
    expect(cell.status).toBe('succeeded');
  });

  it('continues exploration grouping across header-only reasoning gaps', () => {
    const controller = createTestController();
    let state = controller.conversation.transcript;

    const firstBegin = execBeginEvent({
      call_id: 'c1',
      command: ['search', 'alpha'],
      cwd: '/w',
      parsed_cmd: [searchCommand('alpha')],
    });
    state = applyEvent(controller, firstBegin, 'g1', 1);

    const firstEnd: ExecEndEvent = {
      type: 'exec_command_end',
      call_id: 'c1',
      exit_code: 0,
      stdout: '',
      stderr: '',
      aggregated_output: '',
      formatted_output: '',
      duration: '4ms',
    };
    state = applyEvent(controller, firstEnd, 'g2', 2);

    const headerOnlyReasoning: EventMsg = {
      type: 'agent_reasoning_delta',
      delta: '**Exploration pause**',
    };
    state = applyEvent(controller, headerOnlyReasoning, 'g3', 3);

    const secondBegin = execBeginEvent({
      call_id: 'c2',
      command: ['read', 'src/bar.ts'],
      cwd: '/w',
      parsed_cmd: [readCommand('src/bar.ts')],
    });
    state = applyEvent(controller, secondBegin, 'g4', 4);

    const secondEnd: ExecEndEvent = {
      type: 'exec_command_end',
      call_id: 'c2',
      exit_code: 0,
      stdout: '',
      stderr: '',
      aggregated_output: '',
      formatted_output: '',
      duration: '6ms',
    };
    state = applyEvent(controller, secondEnd, 'g5', 5);

    expect(state.cells).toHaveLength(1);
    const cell = expectExecCell(state.cells[0]);
    const exploration = cell.exploration;
    expect(exploration).not.toBeNull();
    if (!exploration) {
      throw new Error('Expected exploration data');
    }
    expect(exploration.calls.map((call) => call.callId)).toEqual(['c1', 'c2']);
  });

  it('starts a new exploration cell after a completed reasoning block', () => {
    const controller = createTestController();
    let state = controller.conversation.transcript;

    state = applyEvent(
      controller,
      sessionConfigured('gpt-5-codex-latest'),
      'gd-session',
      0
    );

    const firstBegin = execBeginEvent({
      call_id: 'c1',
      command: ['search', 'alpha'],
      cwd: '/w',
      parsed_cmd: [searchCommand('alpha')],
    });
    state = applyEvent(controller, firstBegin, 'gd1', 1);

    const firstEnd: ExecEndEvent = {
      type: 'exec_command_end',
      call_id: 'c1',
      exit_code: 0,
      stdout: '',
      stderr: '',
      aggregated_output: '',
      formatted_output: '',
      duration: '4ms',
    };
    state = applyEvent(controller, firstEnd, 'gd2', 2);

    const completedReasoning: EventMsg = {
      type: 'agent_reasoning',
      text: '**Exploration pause**\nReviewing layout components',
    };
    state = applyEvent(controller, completedReasoning, 'gd3', 3);

    const secondBegin = execBeginEvent({
      call_id: 'c2',
      command: ['read', 'src/bar.ts'],
      cwd: '/w',
      parsed_cmd: [readCommand('src/bar.ts')],
    });
    state = applyEvent(controller, secondBegin, 'gd4', 4);

    const secondEnd: ExecEndEvent = {
      type: 'exec_command_end',
      call_id: 'c2',
      exit_code: 0,
      stdout: '',
      stderr: '',
      aggregated_output: '',
      formatted_output: '',
      duration: '6ms',
    };
    state = applyEvent(controller, secondEnd, 'gd5', 5);

    const execCells = state.cells.filter(
      (cell) => (cell as { kind?: unknown }).kind === 'exec'
    ) as TranscriptExecCommandCell[];
    expect(execCells).toHaveLength(2);
    expect(execCells[0]?.exploration?.calls.map((call) => call.callId)).toEqual(
      ['c1']
    );
    expect(execCells[1]?.exploration?.calls.map((call) => call.callId)).toEqual(
      ['c2']
    );
  });

  it('does not mutate prior exploration cells once visible content appears in between', () => {
    const controller = createTestController();
    let state = controller.conversation.transcript;

    const firstBegin = execBeginEvent({
      call_id: 'c1',
      command: ['search', 'alpha'],
      cwd: '/w',
      parsed_cmd: [searchCommand('alpha')],
    });
    state = applyEvent(controller, firstBegin, 'h1', 1);

    const firstEnd: ExecEndEvent = {
      type: 'exec_command_end',
      call_id: 'c1',
      exit_code: 0,
      stdout: '',
      stderr: '',
      aggregated_output: '',
      formatted_output: '',
      duration: '4ms',
    };
    state = applyEvent(controller, firstEnd, 'h2', 2);

    const secondBegin = execBeginEvent({
      call_id: 'c2',
      command: ['read', 'src/foo.ts'],
      cwd: '/w',
      parsed_cmd: [readCommand('src/foo.ts')],
    });
    state = applyEvent(controller, secondBegin, 'h3', 3);

    const secondEnd: ExecEndEvent = {
      type: 'exec_command_end',
      call_id: 'c2',
      exit_code: 0,
      stdout: '',
      stderr: '',
      aggregated_output: '',
      formatted_output: '',
      duration: '5ms',
    };
    state = applyEvent(controller, secondEnd, 'h4', 4);

    const headerOnlyReasoning: EventMsg = {
      type: 'agent_reasoning_delta',
      delta: '**Plan**',
    };
    state = applyEvent(controller, headerOnlyReasoning, 'h5', 5);

    const thirdBegin = execBeginEvent({
      call_id: 'c3',
      command: ['read', 'src/runtime-state.ts'],
      cwd: '/w',
      parsed_cmd: [readCommand('src/runtime-state.ts')],
    });
    state = applyEvent(controller, thirdBegin, 'h6', 6);

    const thirdEnd: ExecEndEvent = {
      type: 'exec_command_end',
      call_id: 'c3',
      exit_code: 0,
      stdout: '',
      stderr: '',
      aggregated_output: '',
      formatted_output: '',
      duration: '7ms',
    };
    state = applyEvent(controller, thirdEnd, 'h7', 7);

    state = applyEvent(
      controller,
      agentMessageEvent('I have a few ideas for restructuring the layout.'),
      'h8',
      9
    );

    const fourthBegin = execBeginEvent({
      call_id: 'c4',
      command: ['search', 'turn_diff'],
      cwd: '/w',
      parsed_cmd: [searchCommand('turn_diff')],
    });
    state = applyEvent(controller, fourthBegin, 'h9', 10);

    const fourthEnd: ExecEndEvent = {
      type: 'exec_command_end',
      call_id: 'c4',
      exit_code: 0,
      stdout: '',
      stderr: '',
      aggregated_output: '',
      formatted_output: '',
      duration: '6ms',
    };
    state = applyEvent(controller, fourthEnd, 'h10', 11);

    expect(state.cells).toHaveLength(3);
    const first = expectExecCell(state.cells[0]);
    const third = expectExecCell(state.cells[2]);

    const firstCalls =
      first.exploration?.calls.map((call) => call.callId) ?? [];
    const thirdCalls =
      third.exploration?.calls.map((call) => call.callId) ?? [];

    expect(firstCalls).toEqual(['c1', 'c2', 'c3']);
    expect(thirdCalls).toEqual(['c4']);
  });

  it('creates a new exploration cell after an agent message', () => {
    const controller = createTestController();
    let state = controller.conversation.transcript;

    const firstBegin = execBeginEvent({
      call_id: 'c1',
      command: ['read', 'package.json'],
      cwd: '/w',
      parsed_cmd: [readCommand('package.json')],
    });
    state = applyEvent(controller, firstBegin, 'm1', 1);

    const firstEnd: ExecEndEvent = {
      type: 'exec_command_end',
      call_id: 'c1',
      exit_code: 0,
      stdout: '',
      stderr: '',
      aggregated_output: '',
      formatted_output: '',
      duration: '5ms',
    };
    state = applyEvent(controller, firstEnd, 'm2', 2);

    state = applyEvent(
      controller,
      agentMessageEvent('Planning next steps'),
      'm3',
      4
    );

    const secondBegin = execBeginEvent({
      call_id: 'c2',
      command: ['read', 'src/runtime-state.ts'],
      cwd: '/w',
      parsed_cmd: [readCommand('src/runtime-state.ts')],
    });
    state = applyEvent(controller, secondBegin, 'm4', 5);

    const secondEnd: ExecEndEvent = {
      type: 'exec_command_end',
      call_id: 'c2',
      exit_code: 0,
      stdout: '',
      stderr: '',
      aggregated_output: '',
      formatted_output: '',
      duration: '6ms',
    };
    state = applyEvent(controller, secondEnd, 'm5', 6);

    const execCells = state.cells
      .filter((cell) => (cell as { kind?: unknown }).kind === 'exec')
      .map(expectExecCell);
    expect(execCells).toHaveLength(2);
    expect(execCells[0]?.exploration?.calls.map((call) => call.callId)).toEqual(
      ['c1']
    );
    expect(execCells[1]?.exploration?.calls.map((call) => call.callId)).toEqual(
      ['c2']
    );
  });

  it('does not retroactively append after an agent message separates exploration runs', () => {
    const controller = createTestController();
    let state = controller.conversation.transcript;

    const makeBegin = (id: string, path: string) =>
      execBeginEvent({
        call_id: id,
        command: ['read', path],
        cwd: '/w',
        parsed_cmd: [readCommand(path)],
      });

    const makeEnd = (id: string): ExecEndEvent => ({
      type: 'exec_command_end',
      call_id: id,
      exit_code: 0,
      stdout: '',
      stderr: '',
      aggregated_output: '',
      formatted_output: '',
      duration: '5ms',
    });

    state = applyEvent(controller, makeBegin('c1', 'package.json'), 'p1', 1);
    state = applyEvent(controller, makeEnd('c1'), 'p2', 2);

    state = applyEvent(
      controller,
      agentMessageEvent('First plan update'),
      'p3',
      4
    );

    state = applyEvent(controller, makeBegin('c2', 'src/sidebar.tsx'), 'p4', 5);
    state = applyEvent(controller, makeEnd('c2'), 'p5', 6);

    state = applyEvent(
      controller,
      agentMessageEvent('Second plan update'),
      'p6',
      8
    );

    state = applyEvent(
      controller,
      makeBegin('c3', 'src/runtime-state.ts'),
      'p7',
      9
    );
    state = applyEvent(controller, makeEnd('c3'), 'p8', 10);

    const execCells = state.cells
      .filter((cell) => (cell as { kind?: unknown }).kind === 'exec')
      .map(expectExecCell);

    expect(execCells).toHaveLength(3);
    expect(execCells[0]?.exploration?.calls.map((call) => call.callId)).toEqual(
      ['c1']
    );
    expect(execCells[1]?.exploration?.calls.map((call) => call.callId)).toEqual(
      ['c2']
    );
    expect(execCells[2]?.exploration?.calls.map((call) => call.callId)).toEqual(
      ['c3']
    );
  });

  it('starts a new exploration cell after an agent message delta updates the transcript', () => {
    const controller = createTestController();
    let state = controller.conversation.transcript;

    const begin = (id: string, path: string) =>
      execBeginEvent({
        call_id: id,
        command: ['read', path],
        cwd: '/w',
        parsed_cmd: [readCommand(path)],
      });

    const end = (id: string): ExecEndEvent => ({
      type: 'exec_command_end',
      call_id: id,
      exit_code: 0,
      stdout: '',
      stderr: '',
      aggregated_output: '',
      formatted_output: '',
      duration: '4ms',
    });

    // Seed an agent message cell so later deltas update in place.
    state = applyEvent(
      controller,
      { type: 'agent_message_delta', delta: 'Initial plan' },
      'e0',
      0
    );

    // First exploration call, completes successfully.
    state = applyEvent(controller, begin('c1', 'package.json'), 'e1', 1);
    state = applyEvent(controller, end('c1'), 'e2', 2);

    // Agent message delta updates the existing transcript cell.
    state = applyEvent(
      controller,
      { type: 'agent_message_delta', delta: ' – gathering more context' },
      'e3',
      3
    );

    // New exploration run should begin in a fresh cell after the delta.
    state = applyEvent(
      controller,
      begin('c2', 'src/runtime-state.ts'),
      'e4',
      4
    );
    state = applyEvent(controller, end('c2'), 'e5', 5);

    const execCells = state.cells
      .filter((cell) => (cell as { kind?: unknown }).kind === 'exec')
      .map(expectExecCell);

    expect(execCells).toHaveLength(1);
    expect(execCells[0]?.exploration?.calls.map((call) => call.callId)).toEqual(
      ['c1', 'c2']
    );
  });

  it('starts a new exploration cell when a task completion updates an existing task', () => {
    const controller = createTestController();
    let state = controller.conversation.transcript;

    const begin = (id: string, path: string) =>
      execBeginEvent({
        call_id: id,
        command: ['read', path],
        cwd: '/w',
        parsed_cmd: [readCommand(path)],
      });

    const end = (id: string): ExecEndEvent => ({
      type: 'exec_command_end',
      call_id: id,
      exit_code: 0,
      stdout: '',
      stderr: '',
      aggregated_output: '',
      formatted_output: '',
      duration: '5ms',
    });

    // Seed an existing task cell that future task completions will update.
    state = applyEvent(
      controller,
      { type: 'task_complete', last_agent_message: 'Initial summary' },
      't0',
      0
    );

    // First exploration run finishes successfully.
    state = applyEvent(controller, begin('c1', 'package.json'), 't1', 1);
    state = applyEvent(controller, end('c1'), 't2', 2);

    // Task completion for the same task arrives again, updating the existing cell.
    state = applyEvent(
      controller,
      { type: 'task_complete', last_agent_message: 'Updated summary' },
      't3',
      3
    );

    // Second exploration must land in a new cell after the task update.
    state = applyEvent(controller, begin('c2', 'src/index.ts'), 't4', 4);
    state = applyEvent(controller, end('c2'), 't5', 5);

    const execCells = state.cells
      .filter((cell) => (cell as { kind?: unknown }).kind === 'exec')
      .map(expectExecCell);

    expect(execCells).toHaveLength(2);
    expect(execCells[0]?.exploration?.calls.map((call) => call.callId)).toEqual(
      ['c1']
    );
    expect(execCells[1]?.exploration?.calls.map((call) => call.callId)).toEqual(
      ['c2']
    );
  });

  it('appends plan update cells with explanation and statuses', () => {
    const controller = createTestController();
    let state = controller.conversation.transcript;

    const planEvent: Extract<EventMsg, { type: 'plan_update' }> = {
      type: 'plan_update',
      explanation: 'Prioritize release readiness tasks.',
      plan: [
        { step: 'Capture outstanding bugs', status: 'completed' },
        { step: 'Draft release notes', status: 'in_progress' },
        { step: 'Announce cutover timeline', status: 'pending' },
      ],
    };

    state = applyEvent(controller, planEvent, 'plan-1', 1);

    expect(state.cells).toHaveLength(1);
    const planCell = expectPlanCell(state.cells[0]);
    expect(planCell.explanation).toBe('Prioritize release readiness tasks.');
    expect(planCell.steps.map((item) => item.status)).toEqual([
      'completed',
      'in_progress',
      'pending',
    ]);
  });
});

describe('user message handling', () => {
  it('merges duplicate legacy user_message events within the same turn', () => {
    const controller = createTestController();
    let state = controller.conversation.transcript;

    state = applyEvent(
      controller,
      { type: 'user_message', message: 'hello world', images: null },
      'user-legacy-1',
      1
    );
    state = applyEvent(
      controller,
      { type: 'task_started', model_context_window: null },
      'task-started',
      2
    );
    state = applyEvent(
      controller,
      { type: 'user_message', message: 'hello world', images: [] },
      'user-legacy-2',
      3
    );

    const userCells = state.cells
      .filter((cell) => (cell as { kind?: unknown }).kind === 'user-message')
      .map(expectUserCell);

    expect(userCells).toHaveLength(1);
    expect(userCells[0]?.eventIds).toEqual(
      expect.arrayContaining(['user-legacy-1', 'user-legacy-2'])
    );
  });

  it('creates a new user cell after the previous turn completes', () => {
    const controller = createTestController();
    let state = controller.conversation.transcript;

    state = applyEvent(
      controller,
      { type: 'user_message', message: 'turn one', images: null },
      'turn-1-user',
      1
    );
    state = applyEvent(
      controller,
      { type: 'task_complete', last_agent_message: 'done' },
      'turn-1-complete',
      2
    );
    state = applyEvent(
      controller,
      { type: 'user_message', message: 'turn two', images: null },
      'turn-2-user',
      3
    );

    const userCells = state.cells
      .filter((cell) => (cell as { kind?: unknown }).kind === 'user-message')
      .map(expectUserCell);

    expect(userCells).toHaveLength(2);
    expect(userCells.map((cell) => cell.message)).toEqual([
      'turn one',
      'turn two',
    ]);
  });
});

describe('reasoning cells', () => {
  const expectReasoningCell = (cell: unknown): TranscriptAgentReasoningCell => {
    if (!cell || typeof cell !== 'object') {
      throw new Error('Expected transcript cell');
    }

    const reasoningCell = cell as { kind?: unknown };
    if (reasoningCell.kind !== 'agent-reasoning') {
      throw new Error(
        `Expected agent-reasoning cell, received "${describeKind(
          reasoningCell.kind
        )}"`
      );
    }

    return cell as TranscriptAgentReasoningCell;
  };

  it('retains earlier reasoning content when later headers have no body', () => {
    const controller = createTestController();
    let state = controller.conversation.transcript;

    state = applyEvent(
      controller,
      agentReasoningEvent(
        makeReasoningText(['**Plan**', 'Review the project structure'])
      ),
      'r1',
      1
    );

    state = applyEvent(
      controller,
      agentReasoningEvent(makeReasoningText(['**Next Steps**'])),
      'r2',
      2
    );

    state = applyEvent(
      controller,
      agentReasoningEvent(
        makeReasoningText(['**Next Steps**', 'Summarize the findings'])
      ),
      'r3',
      3
    );

    const reasoningCells = state.cells
      .filter((cell) => (cell as { kind?: unknown }).kind === 'agent-reasoning')
      .map(expectReasoningCell);
    expect(reasoningCells).toHaveLength(2);
    expect(reasoningCells[0]?.text).toBe('Review the project structure');
    expect(reasoningCells[1]?.text).toBe('Summarize the findings');
  });
});

describe('task cell duration tracking', () => {
  it('creates a new task cell for each turn with correct startedAt timestamp', () => {
    const controller = createTestController();
    let state = controller.conversation.transcript;

    // First turn: task_started followed by task_complete
    state = applyEvent(
      controller,
      { type: 'task_started', model_context_window: null },
      'task-started-1',
      1
    );
    state = applyEvent(
      controller,
      { type: 'task_complete', last_agent_message: 'First turn complete' },
      'task-complete-1',
      3
    );

    // Second turn: task_started followed by task_complete
    state = applyEvent(
      controller,
      { type: 'task_started', model_context_window: null },
      'task-started-2',
      4
    );
    state = applyEvent(
      controller,
      { type: 'task_complete', last_agent_message: 'Second turn complete' },
      'task-complete-2',
      6
    );

    // Third turn: task_started followed by task_complete
    state = applyEvent(
      controller,
      { type: 'task_started', model_context_window: null },
      'task-started-3',
      7
    );
    state = applyEvent(
      controller,
      { type: 'task_complete', last_agent_message: 'Third turn complete' },
      'task-complete-3',
      9
    );

    const taskCells = state.cells
      .filter((cell) => (cell as { kind?: unknown }).kind === 'task')
      .map(expectTaskCell);

    // Should have 3 separate task cells, one for each turn
    expect(taskCells).toHaveLength(3);

    // First task cell should have startedAt from first task_started event
    expect(taskCells[0]?.status).toBe('complete');
    expect(taskCells[0]?.startedAt).toBe(ts(1));
    expect(taskCells[0]?.timestamp).toBe(ts(3));
    expect(taskCells[0]?.lastAgentMessage).toBe('First turn complete');

    // Second task cell should have startedAt from second task_started event
    expect(taskCells[1]?.status).toBe('complete');
    expect(taskCells[1]?.startedAt).toBe(ts(4));
    expect(taskCells[1]?.timestamp).toBe(ts(6));
    expect(taskCells[1]?.lastAgentMessage).toBe('Second turn complete');

    // Third task cell should have startedAt from third task_started event
    expect(taskCells[2]?.status).toBe('complete');
    expect(taskCells[2]?.startedAt).toBe(ts(7));
    expect(taskCells[2]?.timestamp).toBe(ts(9));
    expect(taskCells[2]?.lastAgentMessage).toBe('Third turn complete');
  });

  it('creates a new task cell when previous task cell is already complete', () => {
    const controller = createTestController();
    let state = controller.conversation.transcript;

    // First turn: create and complete a task without task_started event
    // (simulating edge case where task_started might be missing)
    state = applyEvent(
      controller,
      { type: 'task_complete', last_agent_message: 'First turn' },
      'task-complete-1',
      2
    );

    // Second turn: task_started followed by task_complete
    state = applyEvent(
      controller,
      { type: 'task_started', model_context_window: null },
      'task-started-2',
      3
    );
    state = applyEvent(
      controller,
      { type: 'task_complete', last_agent_message: 'Second turn' },
      'task-complete-2',
      5
    );

    const taskCells = state.cells
      .filter((cell) => (cell as { kind?: unknown }).kind === 'task')
      .map(expectTaskCell);

    // Should have 2 separate task cells
    expect(taskCells).toHaveLength(2);

    // First task cell should not have startedAt (no task_started event)
    expect(taskCells[0]?.status).toBe('complete');
    expect(taskCells[0]?.startedAt).toBeNull();
    expect(taskCells[0]?.lastAgentMessage).toBe('First turn');

    // Second task cell should have startedAt from second task_started event
    expect(taskCells[1]?.status).toBe('complete');
    expect(taskCells[1]?.startedAt).toBe(ts(3));
    expect(taskCells[1]?.lastAgentMessage).toBe('Second turn');
  });

  it('creates new task cell when previous one is already complete (no task_started before second complete)', () => {
    const controller = createTestController();
    let state = controller.conversation.transcript;

    // First turn: task_started followed by task_complete
    state = applyEvent(
      controller,
      { type: 'task_started', model_context_window: null },
      'task-started-1',
      1
    );
    state = applyEvent(
      controller,
      { type: 'task_complete', last_agent_message: 'First message' },
      'task-complete-1',
      3
    );

    // Second task_complete arrives without a corresponding task_started
    // Should create a new cell since the previous one is already complete
    state = applyEvent(
      controller,
      { type: 'task_complete', last_agent_message: 'Second message' },
      'task-complete-2',
      5
    );

    const taskCells = state.cells
      .filter((cell) => (cell as { kind?: unknown }).kind === 'task')
      .map(expectTaskCell);

    // Should have 2 separate task cells since the first is already complete
    expect(taskCells).toHaveLength(2);

    // First task cell should have startedAt from task_started event
    expect(taskCells[0]?.status).toBe('complete');
    expect(taskCells[0]?.startedAt).toBe(ts(1));
    expect(taskCells[0]?.lastAgentMessage).toBe('First message');

    // Second task cell should not have startedAt (no task_started event before it)
    expect(taskCells[1]?.status).toBe('complete');
    expect(taskCells[1]?.startedAt).toBeNull();
    expect(taskCells[1]?.lastAgentMessage).toBe('Second message');
  });
});
