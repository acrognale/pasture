import type { FileChange } from '~/codex.gen/FileChange';

export type ExecApprovalRequest = {
  kind: 'exec';
  eventId: string;
  turnId: string;
  conversationId: string;
  callId: string;
  command: string[];
  cwd: string;
  reason: string | null;
};

export type PatchApprovalRequest = {
  kind: 'patch';
  eventId: string;
  turnId: string;
  conversationId: string;
  callId: string;
  fileChanges: Record<string, FileChange | undefined>;
  reason: string | null;
  grantRoot: string | null;
};

export type ApprovalRequest = ExecApprovalRequest | PatchApprovalRequest;
