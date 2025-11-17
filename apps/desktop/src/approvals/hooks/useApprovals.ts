import { useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { useStore } from 'zustand';
import { useWorkspaceApprovalsStore } from '~/workspace';

export const useApprovals = () => {
  const approvalsStore = useWorkspaceApprovalsStore();

  const activeRequest = useStore(
    approvalsStore,
    (state) => state.activeRequest
  );
  const queueLength = useStore(approvalsStore, (state) => state.queue.length);
  const lastNotifiedId = useStore(
    approvalsStore,
    (state) => state.lastNotifiedId
  );

  useEffect(() => {
    if (!activeRequest || activeRequest.eventId === lastNotifiedId) {
      return;
    }

    approvalsStore.getState().markNotified(activeRequest.eventId);

    if (activeRequest.kind === 'exec') {
      const command =
        activeRequest.command.length === 1
          ? activeRequest.command[0]
          : activeRequest.command.join(' ');
      toast.message('Codex wants to run a command.', {
        description: command,
      });
    } else {
      const changedPaths = Object.keys(activeRequest.fileChanges ?? {});
      const description =
        changedPaths.length === 1
          ? changedPaths[0]
          : `${changedPaths.length} files`;
      toast.message('Codex wants to edit files.', {
        description,
      });
    }
  }, [activeRequest, approvalsStore, lastNotifiedId]);

  return useMemo(
    () => ({
      activeRequest,
      queueSize: (activeRequest ? 1 : 0) + queueLength,
    }),
    [activeRequest, queueLength]
  );
};
