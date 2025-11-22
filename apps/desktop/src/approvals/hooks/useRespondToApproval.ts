import { useMutation } from '@tanstack/react-query';
import { produce } from 'immer';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { Codex } from '~/codex/client';
import { useWorkspaceApprovalsStore } from '~/workspace';
import { useWorkspaceConversationStores } from '~/workspace';

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
  const { getConversationStore } = useWorkspaceConversationStores();
  const advanceQueue = useCallback(
    () => approvalsStore.getState().advance(),
    [approvalsStore]
  );
  const markApprovalInTranscript = useCallback(
    (request: ApprovalRequest, decision: ApprovalDecision) => {
      const store = getConversationStore(request.conversationId);
      store.setState((state) =>
        produce(state, (draft) => {
          const transcript = draft.conversation.transcript;
          const turn = transcript.turns[request.turnId];
          const cell =
            turn?.cells.find((entry) => entry.id === request.eventId) ?? null;

          if (!cell) {
            return;
          }

          if (cell.kind === 'exec-approval' && request.kind === 'exec') {
            cell.decision =
              decision === 'approve'
                ? 'approved'
                : decision === 'approve_for_session'
                  ? 'approved_for_session'
                  : 'rejected';
          } else if (
            cell.kind === 'patch-approval' &&
            request.kind === 'patch'
          ) {
            cell.decision = decision === 'approve' ? 'approved' : 'rejected';
          }
        })
      );
    },
    [getConversationStore]
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
      markApprovalInTranscript(result.request, result.decision);
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
