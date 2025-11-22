import type { FileChange } from '~/codex.gen/FileChange';

export type ExecApprovalRequest = {
  kind: 'exec';
  turnId: string;
  conversationId: string;
  callId: string;
  command: string[];
  cwd: string;
  reason: string | null;
};

export type PatchApprovalRequest = {
  kind: 'patch';
  turnId: string;
  conversationId: string;
  callId: string;
  fileChanges: Record<string, FileChange | undefined>;
  reason: string | null;
  grantRoot: string | null;
};

export type ApprovalRequest = ExecApprovalRequest | PatchApprovalRequest;
