/**
 * Replay timing configuration for performance testing.
 *
 * Controls how quickly different event types are emitted during replay.
 * Use lower values to stress-test rendering performance.
 */
export type ReplayTimingConfig = {
  /** Delay between delta events (ms) - deltas stream rapidly during agent responses */
  deltaEvents: number;
  /** Delay between user messages (ms) */
  userMessages: number;
  /** Delay between agent message start/end events (ms) */
  agentMessages: number;
  /** Delay between execution events (ms) */
  execEvents: number;
  /** Delay between approval request/response events (ms) */
  approvalEvents: number;
  /** Default delay for any other event type (ms) */
  default: number;
};

/**
 * Default replay timing - simulates realistic streaming with some acceleration
 */
export const DEFAULT_REPLAY_TIMING: ReplayTimingConfig = {
  deltaEvents: 10, // Very fast deltas to simulate streaming
  userMessages: 10, // Brief pause between user messages
  agentMessages: 10, // Moderate delay for agent message boundaries
  execEvents: 10, // Quick execution events
  approvalEvents: 10, // Slightly slower for approval flow
  default: 50, // Fast default for other events
};

/**
 * Stress test timing - maximum speed for performance testing
 */
export const STRESS_TEST_TIMING: ReplayTimingConfig = {
  deltaEvents: 0, // No delay - maximum stress
  userMessages: 0,
  agentMessages: 0,
  execEvents: 0,
  approvalEvents: 0,
  default: 0,
};

/**
 * Realistic timing - matches actual Codex streaming behavior
 */
export const REALISTIC_TIMING: ReplayTimingConfig = {
  deltaEvents: 50, // Realistic delta frequency
  userMessages: 1000, // Natural pause between messages
  agentMessages: 500, // Agent thinking time
  execEvents: 200, // Command execution timing
  approvalEvents: 1000, // Time to review approvals
  default: 100,
};

/**
 * Get delay for a specific event type
 */
export function getEventDelay(
  eventType: string,
  config: ReplayTimingConfig = DEFAULT_REPLAY_TIMING
): number {
  if (eventType.includes('_delta')) {
    return config.deltaEvents;
  }

  if (eventType === 'user_message') {
    return config.userMessages;
  }

  if (eventType === 'agent_message' || eventType === 'agent_message_start') {
    return config.agentMessages;
  }

  if (eventType.startsWith('exec_')) {
    return config.execEvents;
  }

  if (eventType.includes('approval')) {
    return config.approvalEvents;
  }

  return config.default;
}
