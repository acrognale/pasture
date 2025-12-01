/**
 * Shared transcript types for displaying conversation transcripts.
 * These types are designed to be platform-agnostic and can be used
 * in both the desktop app and web app.
 */

export type TranscriptTurnStatus = 'active' | 'completed' | 'aborted';

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

/**
 * Base cell properties shared by all cell types
 */
export type BaseTranscriptCell = {
  id: string;
  timestamp?: string;
  kind: TranscriptCellKind;
};

/**
 * User message cell
 */
export type TranscriptUserMessageCell = BaseTranscriptCell & {
  kind: 'user-message';
  message: string;
  messageKind?: string;
  images?: string[];
};

/**
 * Agent message cell
 */
export type TranscriptAgentMessageCell = BaseTranscriptCell & {
  kind: 'agent-message';
  message: string;
};

/**
 * Agent reasoning cell (for extended thinking)
 */
export type TranscriptAgentReasoningCell = BaseTranscriptCell & {
  kind: 'agent-reasoning';
  text: string;
  visible?: boolean;
};

/**
 * Task lifecycle cell
 */
export type TranscriptTaskCell = BaseTranscriptCell & {
  kind: 'task';
  status: 'started' | 'complete';
  modelContextWindow?: string;
  lastAgentMessage?: string;
  startedAt?: string;
};

/**
 * Command execution result cell
 */
export type TranscriptExecCell = BaseTranscriptCell & {
  kind: 'exec';
  callId: string;
  command: string[];
  cwd?: string;
  status: 'running' | 'succeeded' | 'failed';
  stdout: string;
  stderr: string;
  aggregatedOutput?: string;
  exitCode?: number | null;
  duration?: string;
};

/**
 * Execution approval request cell
 */
export type TranscriptExecApprovalCell = BaseTranscriptCell & {
  kind: 'exec-approval';
  callId: string;
  command: string[];
  cwd?: string;
  reason?: string;
  decision: 'pending' | 'approved' | 'approved_for_session' | 'rejected';
};

/**
 * Plan update cell
 */
export type TranscriptPlanCell = BaseTranscriptCell & {
  kind: 'plan';
  explanation?: string;
  steps: Array<{ step: string; status: string }>;
};

/**
 * Status event cell (token counts, turn aborted, background events)
 */
export type TranscriptStatusCell = BaseTranscriptCell & {
  kind: 'status';
  statusType: 'token-count' | 'turn-aborted' | 'background';
  summary: string;
  data?: unknown;
};

/**
 * Error cell
 */
export type TranscriptErrorCell = BaseTranscriptCell & {
  kind: 'error';
  severity: 'error' | 'stream';
  message: string;
};

/**
 * Patch application cell
 */
export type TranscriptPatchCell = BaseTranscriptCell & {
  kind: 'patch';
  callId: string;
  autoApproved?: boolean;
  changes: Record<string, FileChange | undefined>;
  status: 'applying' | 'succeeded' | 'failed';
  stdout?: string;
  stderr?: string;
  success?: boolean;
};

/**
 * Patch approval request cell
 */
export type TranscriptPatchApprovalCell = BaseTranscriptCell & {
  kind: 'patch-approval';
  callId: string;
  reason?: string;
  grantRoot?: string;
  changes: Record<string, FileChange | undefined>;
  decision: 'pending' | 'approved' | 'rejected';
};

/**
 * Tool invocation cell (MCP, web search, etc.)
 */
export type TranscriptToolCell = BaseTranscriptCell & {
  kind: 'tool';
  toolType: 'mcp' | 'web-search' | 'view-image';
  status: 'running' | 'succeeded' | 'failed';
  callId?: string;
  invocation?: McpInvocation;
  result?: unknown;
  duration?: string;
  path?: string;
  query?: string;
};

/**
 * Generic/fallback cell for unknown event types
 */
export type TranscriptGenericCell = BaseTranscriptCell & {
  kind: 'generic';
  eventType?: string;
  payload?: unknown;
};

/**
 * Session configured cell (usually hidden)
 */
export type TranscriptSessionConfiguredCell = BaseTranscriptCell & {
  kind: 'session-configured';
  sessionId?: string;
  model?: string;
};

/**
 * Union type of all transcript cells
 */
export type TranscriptCell =
  | TranscriptSessionConfiguredCell
  | TranscriptUserMessageCell
  | TranscriptAgentMessageCell
  | TranscriptAgentReasoningCell
  | TranscriptTaskCell
  | TranscriptExecCell
  | TranscriptExecApprovalCell
  | TranscriptPlanCell
  | TranscriptStatusCell
  | TranscriptErrorCell
  | TranscriptPatchCell
  | TranscriptPatchApprovalCell
  | TranscriptToolCell
  | TranscriptGenericCell;

/**
 * A turn in the transcript (typically one user message + agent response)
 */
export type TranscriptTurn = {
  id: string;
  cells: TranscriptCell[];
  status: TranscriptTurnStatus;
  startedAt?: string;
  completedAt?: string;
};

/**
 * The complete transcript state
 */
export type TranscriptState = {
  turns: Record<string, TranscriptTurn>;
  turnOrder: string[];
};

/**
 * File change information for patches
 */
export type FileChange = {
  type: 'create' | 'update' | 'delete';
  diff?: string;
  content?: string;
};

/**
 * MCP tool invocation details
 */
export type McpInvocation = {
  serverName: string;
  toolName: string;
  arguments?: Record<string, unknown>;
};

/**
 * Context for transcript components - provides platform-specific functionality
 */
export type TranscriptContext = {
  /**
   * Copy text to clipboard. Returns true on success.
   */
  copyToClipboard?: (text: string) => Promise<boolean>;

  /**
   * Format a timestamp for display
   */
  formatTimestamp?: (timestamp: string) => string;

  /**
   * Workspace path for making file paths relative
   */
  workspacePath?: string;
};
