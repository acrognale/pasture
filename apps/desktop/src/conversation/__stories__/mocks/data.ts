import type { ConversationSummary } from '~/codex.gen/ConversationSummary';
import type { FileChange } from '~/codex.gen/FileChange';
import type { ParsedCommand } from '~/codex.gen/ParsedCommand';
import type { ComposerTurnConfig } from '~/composer/config';
import { createDefaultComposerConfig } from '~/composer/config';
import {
  type ConversationState,
  createInitialConversationState,
} from '~/conversation/store/reducer';
import { emptyIndices } from '~/conversation/transcript/indices';
import type {
  TranscriptAgentMessageCell,
  TranscriptAgentReasoningCell,
  TranscriptCell,
  TranscriptErrorCell,
  TranscriptExecApprovalCell,
  TranscriptExecCommandCell,
  TranscriptExplorationCall,
  TranscriptPatchApprovalCell,
  TranscriptPlanCell,
  TranscriptState,
  TranscriptStatusCell,
  TranscriptTaskCell,
  TranscriptToolCell,
  TranscriptUserMessageCell,
} from '~/conversation/transcript/types';

const iso = (value: string) => new Date(value).toISOString();

// Mock workspace path for story data
const MOCK_WORKSPACE_PATH = '/path/to/workspace';

const userMessage = (
  overrides: Partial<TranscriptUserMessageCell>
): TranscriptUserMessageCell => ({
  id: 'cell-user',
  timestamp: iso('2025-11-02T20:55:18Z'),
  eventIds: ['evt-user-1'],
  kind: 'user-message',
  message:
    'There\'s a bug in the turn review pane. Even if the base turn is "workspace start", changing from turn 1 to turn 2 just shows the diff of turn 1 to turn 2, not the cumulative difference. Explore the code and come up with a plan for fixing that.',
  messageKind: 'plain',
  images: null,
  itemId: null,
  ...overrides,
});

const agentReasoning = (
  overrides: Partial<TranscriptAgentReasoningCell>
): TranscriptAgentReasoningCell => ({
  id: 'cell-reasoning',
  timestamp: iso('2025-11-02T20:55:25Z'),
  eventIds: ['evt-reasoning-1'],
  kind: 'agent-reasoning',
  text: "**Analyzing turn review cumulative diff bug**\n\nThe issue is that when the user changes turns, the diff shown doesn't account for the cumulative changes from the workspace start. Need to:\n\n1. Examine `TurnReviewContext.tsx` to understand how diffs are loaded\n2. Check how the base turn selection affects diff calculation\n3. Identify where the cumulative diff logic breaks down\n\n> Will search for turn review components and trace the data flow.",
  streaming: false,
  visible: true,
  itemId: null,
  ...overrides,
});

const agentMessage = (
  overrides: Partial<TranscriptAgentMessageCell>
): TranscriptAgentMessageCell => ({
  id: 'cell-agent',
  timestamp: iso('2025-11-02T21:45:32Z'),
  eventIds: ['evt-agent-1'],
  kind: 'agent-message',
  message:
    'Turn review now re-queries snapshot metadata whenever the history grows or a new cumulative diff comes back, so the base dropdown picks up earlier turns as soon as their snapshots exist. I also refresh the diff cache only once a cumulative range diff resolves and retry snapshot/diff fetches after transient errors, which keeps the pane in sync while snapshots land.\n\n**Changes made:**\n\n- Updated `TurnReviewContext.tsx` to track snapshot availability\n- Modified diff loading logic to prefer cumulative diffs over incremental ones\n- Added error handling for missing snapshots\n\nValidated by running:\n```bash\nnpm test -- --run src/review/__tests__/turn-review-context.test.tsx\n```',
  streaming: false,
  itemId: null,
  ...overrides,
});

const taskCell = (
  overrides: Partial<TranscriptTaskCell>
): TranscriptTaskCell => ({
  id: 'cell-task',
  timestamp: iso('2025-11-02T20:55:20Z'),
  eventIds: ['evt-task-1'],
  kind: 'task',
  status: 'started',
  modelContextWindow: '200k',
  lastAgentMessage: null,
  startedAt: iso('2025-11-02T20:55:20Z'),
  ...overrides,
});

const execCommandCell = (
  overrides: Partial<TranscriptExecCommandCell>
): TranscriptExecCommandCell => ({
  id: 'cell-exec',
  timestamp: iso('2025-11-02T20:55:30Z'),
  eventIds: ['evt-exec-begin', 'evt-exec-end'],
  kind: 'exec',
  callId: 'call-search-turnreview',
  command: ['bash', '-lc', 'rg "TurnReview"'],
  cwd: MOCK_WORKSPACE_PATH,
  parsed: [
    {
      type: 'search',
      cmd: 'rg "TurnReview"',
      query: 'TurnReview',
      path: null,
    } satisfies ParsedCommand,
  ],
  status: 'succeeded',
  stdout:
    "src/conversation/ConversationPane.tsx:import { TurnReviewProvider } from '~/review/TurnReviewContext';\n" +
    "src/conversation/ConversationPane.tsx:import { TurnReviewPane } from '~/review/TurnReviewPane';\n" +
    'src/review/TurnReviewContext.tsx:type TurnReviewContextValue = {\n' +
    'src/review/TurnReviewContext.tsx:export const TurnReviewProvider: ParentComponent<TurnReviewProviderProps> = (\n' +
    'src/review/TurnReviewContext.tsx:export const useTurnReview = () => {\n' +
    'src/review/TurnReviewPane.tsx:export const TurnReviewPane = (props: TurnReviewPaneProps) => {\n',
  stderr: '',
  aggregatedOutput: '',
  formattedOutput: '',
  exitCode: 0,
  duration: 'PT0.12S',
  streaming: false,
  outputChunks: [],
  exploration: null,
  ...overrides,
});

const execApprovalCell = (
  overrides: Partial<TranscriptExecApprovalCell>
): TranscriptExecApprovalCell => ({
  id: 'cell-exec-approval',
  timestamp: iso('2025-11-02T21:42:15Z'),
  eventIds: ['evt-exec-approval'],
  kind: 'exec-approval',
  callId: 'call-run-tests',
  command: [
    'npm',
    'test',
    '--',
    '--run',
    'src/review/__tests__/turn-review-context.test.tsx',
  ],
  cwd: MOCK_WORKSPACE_PATH,
  reason: 'Running tests to validate the turn review cumulative diff fix.',
  decision: 'pending',
  ...overrides,
});

const patchApprovalCell = (
  overrides: Partial<TranscriptPatchApprovalCell>
): TranscriptPatchApprovalCell => ({
  id: 'cell-patch-approval',
  timestamp: iso('2025-11-02T21:40:20Z'),
  eventIds: ['evt-patch-approval'],
  kind: 'patch-approval',
  callId: 'call-fix-cumulative-diff',
  reason: 'Update TurnReviewContext to fix cumulative diff calculation',
  grantRoot: null,
  changes: {
    'src/review/TurnReviewContext.tsx': {
      update: {
        unified_diff:
          "--- a/src/review/TurnReviewContext.tsx\n+++ b/src/review/TurnReviewContext.tsx\n@@ -45,6 +45,14 @@ export const TurnReviewProvider: ParentComponent<TurnReviewProviderProps> = (\n   const [snapshotMetadata, setSnapshotMetadata] =\n     createSignal<TurnSnapshotMetadata | null>(null);\n \n+  // Re-query snapshot metadata when history grows\n+  createEffect(() => {\n+    const h = props.history;\n+    if (h.length > 0) {\n+      void loadSnapshotMetadata();\n+    }\n+  });\n+\n   const loadSnapshotMetadata = async () => {\n     try {\n       const metadata = await getDiffSnapshotMetadata(\n@@ -89,7 +97,7 @@ export const TurnReviewProvider: ParentComponent<TurnReviewProviderProps> = (\n       const rangeKey = `${base}-${rightTurn()}`;\n \n       // Check if we already have this diff cached\n-      if (diffCache[rangeKey]) {\n+      if (diffCache[rangeKey] && base !== 'workspace start') {\n         return;\n       }\n \n",
        move_path: null,
      },
    } as FileChange,
  },
  decision: 'pending',
  ...overrides,
});

const toolCell = (
  overrides: Partial<TranscriptToolCell>
): TranscriptToolCell => ({
  id: 'cell-tool',
  timestamp: iso('2024-07-22T15:03:12Z'),
  eventIds: ['evt-tool-1'],
  kind: 'tool',
  toolType: 'mcp',
  status: 'succeeded',
  callId: 'tool-1',
  invocation: {
    server: 'repo-tools',
    tool: 'read_file',
    arguments: { path: 'docs/RELEASE_NOTES.md' },
  },
  result: {
    summary: 'Located release notes file with previous version entries.',
  },
  duration: 'PT0.8S',
  path: 'docs/RELEASE_NOTES.md',
  query: null,
  itemId: null,
  ...overrides,
});

const statusCell = (
  overrides: Partial<TranscriptStatusCell>
): TranscriptStatusCell => ({
  id: 'cell-status',
  timestamp: iso('2025-11-02T21:45:25Z'),
  eventIds: ['evt-status-1'],
  kind: 'status',
  statusType: 'token-count',
  summary: 'Using 8,457 of 200,000 context tokens',
  data: {
    total_tokens: 8457,
    reasoning_output_tokens: 342,
  },
  ...overrides,
});

const errorCell = (
  overrides: Partial<TranscriptErrorCell>
): TranscriptErrorCell => ({
  id: 'cell-error',
  timestamp: iso('2025-11-02T21:38:28Z'),
  eventIds: ['evt-error-1'],
  kind: 'error',
  severity: 'error',
  message:
    "TypeScript compilation failed: Property 'snapshotMetadata' does not exist on type 'TurnReviewContextValue'.",
  ...overrides,
});

const explorationCell = (
  overrides: Partial<TranscriptExecCommandCell>
): TranscriptExecCommandCell => ({
  id: 'cell-exploration',
  timestamp: iso('2025-11-02T20:55:28Z'),
  eventIds: ['evt-exploration-1'],
  kind: 'exec',
  callId: 'call-explore-turnreview',
  command: [],
  cwd: MOCK_WORKSPACE_PATH,
  parsed: [],
  status: 'succeeded',
  stdout: '',
  stderr: '',
  aggregatedOutput: '',
  formattedOutput: '',
  exitCode: 0,
  duration: 'PT1.2S',
  streaming: false,
  outputChunks: [],
  exploration: {
    calls: [
      {
        callId: 'explore-call-1',
        command: ['bash', '-lc', 'rg "TurnReview"'],
        parsed: [
          {
            type: 'search',
            cmd: 'rg "TurnReview"',
            query: 'TurnReview',
            path: null,
          },
        ],
        status: 'succeeded',
        duration: 'PT0.15S',
      } satisfies TranscriptExplorationCall,
      {
        callId: 'explore-call-2',
        command: [
          'bash',
          '-lc',
          "sed -n '1,200p' src/review/TurnReviewContext.tsx",
        ],
        parsed: [
          {
            type: 'read',
            cmd: "sed -n '1,200p' src/review/TurnReviewContext.tsx",
            name: 'src/review/TurnReviewContext.tsx',
            path: 'src/review/TurnReviewContext.tsx',
          },
        ],
        status: 'succeeded',
        duration: 'PT0.08S',
      } satisfies TranscriptExplorationCall,
    ],
  },
  ...overrides,
});

const planCell = (
  overrides: Partial<TranscriptPlanCell>
): TranscriptPlanCell => ({
  id: 'cell-plan',
  timestamp: iso('2025-11-02T20:56:15Z'),
  eventIds: ['evt-plan-1'],
  kind: 'plan',
  steps: [
    {
      status: 'completed',
      step: "Confirm how turn review cache handles `workspace start` ranges when snapshots aren't ready yet",
    },
    {
      status: 'in_progress',
      step: 'Design adjustment so cumulative diffs replace per-turn fallbacks once range data becomes available',
    },
    {
      status: 'pending',
      step: 'Outline validation strategy (tests or manual) to ensure the regression is covered',
    },
  ],
  explanation:
    'Breaking down the cumulative diff fix into concrete implementation steps',
  ...overrides,
});

export type MockExecApprovalRequest = {
  kind: 'exec';
  eventId: string;
  conversationId: string;
  callId: string;
  command: string[];
  cwd: string;
  reason: string | null;
};

export type MockPatchApprovalRequest = {
  kind: 'patch';
  eventId: string;
  conversationId: string;
  callId: string;
  fileChanges: Record<string, FileChange | undefined>;
  reason: string | null;
  grantRoot: string | null;
};

export const sampleConversationSummaries: ConversationSummary[] = [
  {
    conversationId: 'session-turn-review-fix',
    path: 'turn-review-cumulative-diff.md',
    cwd: MOCK_WORKSPACE_PATH,
    preview: 'Fix turn review cumulative diff bug',
    timestamp: iso('2025-11-02T21:46:00Z'),
  },
  {
    conversationId: 'session-transcript-refactor',
    path: 'transcript-primitives.md',
    cwd: MOCK_WORKSPACE_PATH,
    preview: 'Refactor transcript cells to use primitives',
    timestamp: iso('2025-11-02T17:30:00Z'),
  },
];

export const sampleComposerConfig: ComposerTurnConfig = {
  ...createDefaultComposerConfig(),
  model: 'claude-sonnet-4-5',
  reasoningEffort: 'medium',
  sandbox: 'workspace-write',
  approval: 'on-request',
};

type ConversationRuntimeSnapshot = Pick<
  ConversationState,
  | 'activeTurnStartedAt'
  | 'contextTokensInWindow'
  | 'maxContextWindow'
  | 'statusHeader'
  | 'statusOverride'
  | 'latestTurnDiff'
>;

export const sampleConversationRuntime: ConversationRuntimeSnapshot = {
  activeTurnStartedAt: iso('2025-11-02T20:55:20Z'),
  contextTokensInWindow: 8457,
  maxContextWindow: 200000,
  statusHeader: 'Analyzing turn review context',
  statusOverride: null,
  latestTurnDiff: null,
};

export const sampleExecApprovalRequest: MockExecApprovalRequest = {
  kind: 'exec',
  eventId: 'evt-exec-approval',
  conversationId: 'session-turn-review-fix',
  callId: 'call-run-tests',
  command: [
    'npm',
    'test',
    '--',
    '--run',
    'src/review/__tests__/turn-review-context.test.tsx',
  ],
  cwd: MOCK_WORKSPACE_PATH,
  reason: 'Running tests to validate the turn review cumulative diff fix.',
};

export const samplePatchApprovalRequest: MockPatchApprovalRequest = {
  kind: 'patch',
  eventId: 'evt-patch-approval',
  conversationId: 'session-turn-review-fix',
  callId: 'call-fix-cumulative-diff',
  fileChanges: {
    'src/review/TurnReviewContext.tsx': {
      update: {
        unified_diff:
          "--- a/src/review/TurnReviewContext.tsx\n+++ b/src/review/TurnReviewContext.tsx\n@@ -45,6 +45,14 @@ export const TurnReviewProvider: ParentComponent<TurnReviewProviderProps> = (\n   const [snapshotMetadata, setSnapshotMetadata] =\n     createSignal<TurnSnapshotMetadata | null>(null);\n \n+  // Re-query snapshot metadata when history grows\n+  createEffect(() => {\n+    const h = props.history;\n+    if (h.length > 0) {\n+      void loadSnapshotMetadata();\n+    }\n+  });\n+\n   const loadSnapshotMetadata = async () => {\n     try {\n       const metadata = await getDiffSnapshotMetadata(\n@@ -89,7 +97,7 @@ export const TurnReviewProvider: ParentComponent<TurnReviewProviderProps> = (\n       const rangeKey = `${base}-${rightTurn()}`;\n \n       // Check if we already have this diff cached\n-      if (diffCache[rangeKey]) {\n+      if (diffCache[rangeKey] && base !== 'workspace start') {\n         return;\n       }\n \n",
        move_path: null,
      },
    },
  },
  reason: 'Update TurnReviewContext to fix cumulative diff calculation',
  grantRoot: null,
};

export const sampleTranscript: TranscriptState = {
  cells: [
    userMessage({ id: 'cell-user-1' }),
    taskCell({ id: 'cell-task-1' }),
    agentReasoning({ id: 'cell-reasoning-1' }),
    explorationCell({ id: 'cell-exploration-1' }),
    planCell({ id: 'cell-plan-1' }),
    execCommandCell({ id: 'cell-exec-1' }),
    toolCell({ id: 'cell-tool-1' }),
    patchApprovalCell({ id: 'cell-patch-approval-1' }),
    agentMessage({ id: 'cell-agent-1' }),
    execApprovalCell({ id: 'cell-exec-approval-1' }),
    statusCell({ id: 'cell-status-1' }),
    errorCell({ id: 'cell-error-1' }),
  ] satisfies TranscriptCell[],
  latestReasoningHeader: 'Analyzing turn review cumulative diff bug',
  pendingReasoningText: null,
  pendingTaskStartedAt: iso('2025-11-02T20:55:20Z'),
  shouldBreakExecGroup: false,
  indices: emptyIndices(),
  openUserMessageCellIndex: null,
  openAgentMessageCellIndex: null,
  reasoningSummaryFormat: 'none',
  latestTurnDiff: null,
  turnDiffHistory: [],
  turnCounter: 0,
  activeTurnNumber: null,
};

export const sampleCollapsedTranscript: TranscriptState = {
  cells: [
    userMessage({
      id: 'cell-user-collapsed-1',
      message:
        'Can you summarize the refactor steps we need before GA and highlight any risky migrations?',
    }),
    planCell({
      id: 'cell-plan-collapsed-1',
      steps: [
        { step: 'Audit feature flags', status: 'in_progress' },
        { step: 'Verify telemetry coverage', status: 'pending' },
      ],
    }),
    agentReasoning({
      id: 'cell-reasoning-collapsed-1',
      text: 'Evaluating release readiness and pruning outstanding migrations.',
    }),
    toolCell({
      id: 'cell-tool-collapsed-1',
      result: {
        summary: 'Located migration checklist in docs/release-plan.md',
      },
    }),
    agentMessage({
      id: 'cell-agent-collapsed-1',
      message:
        'Summary: finish cleaning up the auth adapter, backfill the analytics events, and verify the desktop installer pipeline before launch.',
    }),
    statusCell({
      id: 'cell-status-collapsed-1',
      summary: 'Using 18,421 of 200,000 context tokens',
    }),
    userMessage({
      id: 'cell-user-collapsed-2',
      message:
        'Great—queue a turn to backfill analytics once the adapter ships.',
    }),
    agentMessage({
      id: 'cell-agent-collapsed-2',
      message:
        'Will do. I will prepare the analytics backfill runbook for the follow-up turn.',
    }),
  ] satisfies TranscriptCell[],
  latestReasoningHeader:
    'Evaluating release readiness and pruning outstanding migrations.',
  pendingReasoningText: null,
  pendingTaskStartedAt: null,
  shouldBreakExecGroup: false,
  indices: emptyIndices(),
  openUserMessageCellIndex: null,
  openAgentMessageCellIndex: null,
  reasoningSummaryFormat: 'none',
  latestTurnDiff: null,
  turnDiffHistory: [],
  turnCounter: 0,
  activeTurnNumber: null,
};

export const createSampleConversationState = (): ConversationState => ({
  ...createInitialConversationState(),
  ...sampleConversationRuntime,
  transcript: sampleTranscript,
});
