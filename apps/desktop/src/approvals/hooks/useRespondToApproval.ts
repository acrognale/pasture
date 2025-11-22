import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { Codex } from '~/codex/client';
import { useWorkspaceApprovalsStore } from '~/workspace';

import type { ApprovalRequest } from '../types';

export type ApprovalDecision = 'approve' | 'approve_for_session' | 'abort';

const mapApprovalDecision = (
  request: ApprovalRequest,
  decision: ApprovalDecision
): string => {
  if (request.kind === 'patch') {
    return decision === 'approve' ? 'approved' : 'abort';
  }

  switch (decision) {
    case 'approve':
      return 'approved';
    case 'approve_for_session':
      return 'approved_for_session';
    case 'abort':
    default:
      return 'abort';
  }
};

export const useRespondToApproval = () => {
  const approvalsStore = useWorkspaceApprovalsStore();
  const advanceQueue = useCallback(
    () => approvalsStore.getState().advance(),
    [approvalsStore]
  );

  return useMutation({
    mutationFn: async ({
      request,
      decision,
    }: {
      request: ApprovalRequest;
      decision: ApprovalDecision;
    }) => {
      if (request.kind === 'patch' && decision === 'approve_for_session') {
        throw new Error(
          'Session-wide approval is not available for patch edits.'
        );
      }

      const decisionParam = mapApprovalDecision(request, decision);

      await Codex.respondApproval({
        conversationId: request.conversationId,
        eventId: request.turnId,
        decision: decisionParam,
        approvalType: request.kind,
      });

      const message =
        request.kind === 'exec'
          ? decision === 'approve'
            ? 'Command approved.'
            : decision === 'approve_for_session'
              ? 'Command approved for this session.'
              : 'Command request aborted.'
          : decision === 'approve'
            ? 'Edits approved.'
            : 'Edit request rejected.';

      return {
        request,
        decision,
        message,
      };
    },
    onSuccess: (result) => {
      toast.success(result.message);
      advanceQueue();
    },
    onError: (error: Error) => {
      const reason = error.message || String(error);
      toast.error('Failed to respond to approval request.', {
        description: reason,
      });
    },
  });
};
