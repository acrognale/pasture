import type { ApplyPatchApprovalRequestEvent } from '~/codex.gen/ApplyPatchApprovalRequestEvent';
import type { ConversationEventPayload } from '~/codex.gen/ConversationEventPayload';
import type { ExecApprovalRequestEvent } from '~/codex.gen/ExecApprovalRequestEvent';

import type {
  ApprovalRequest,
  ExecApprovalRequest,
  PatchApprovalRequest,
} from './types';

// Codex core never persists ExecApprovalRequest / ApplyPatchApprovalRequest
// events into rollouts (see codex-rs core/src/rollout/policy.rs), so
// initializeConversation history cannot surface historical approvals. The
// replay turn-id checks below are defensive in case that upstream behavior
// ever changes.
const isReplayTurnId = (turnId: string): boolean =>
  turnId.startsWith('initial::') || turnId.startsWith('replay::');

const isExecApprovalPayload = (
  payload: ConversationEventPayload
): payload is ConversationEventPayload & { event: ExecApprovalRequestEvent } =>
  payload.event.type === 'exec_approval_request';

const isPatchApprovalPayload = (
  payload: ConversationEventPayload
): payload is ConversationEventPayload & {
  event: ApplyPatchApprovalRequestEvent;
} => payload.event.type === 'apply_patch_approval_request';

const toExecApprovalRequest = (
  payload: ConversationEventPayload & { event: ExecApprovalRequestEvent }
): ExecApprovalRequest => {
  const event = payload.event;
  return {
    kind: 'exec',
    eventId: payload.eventId,
    turnId: payload.turnId,
    conversationId: payload.conversationId,
    callId: event.call_id,
    command: event.command,
    cwd: event.cwd,
    reason: event.reason,
  };
};

const toPatchApprovalRequest = (
  payload: ConversationEventPayload & {
    event: ApplyPatchApprovalRequestEvent;
  }
): PatchApprovalRequest => {
  const event = payload.event;
  return {
    kind: 'patch',
    eventId: payload.eventId,
    turnId: payload.turnId,
    conversationId: payload.conversationId,
    callId: event.call_id,
    fileChanges: event.changes,
    reason: event.reason,
    grantRoot: event.grant_root,
  };
};

export const mapConversationEventToApprovalRequest = (
  payload: ConversationEventPayload
): ApprovalRequest | null => {
  if (!payload.conversationId || isReplayTurnId(payload.turnId)) {
    return null;
  }

  if (isExecApprovalPayload(payload)) {
    return toExecApprovalRequest(payload);
  }

  if (isPatchApprovalPayload(payload)) {
    return toPatchApprovalRequest(payload);
  }

  return null;
};
