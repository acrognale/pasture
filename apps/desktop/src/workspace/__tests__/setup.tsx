import { act } from '@testing-library/react';
import { useEffect } from 'react';
import {
  Sidebar,
  SidebarContent,
  SidebarProvider,
} from '~/components/ui/sidebar';
import { ConversationProvider } from '~/conversation/store';
import { renderWithProviders } from '~/testing/harness';
import { WorkspaceProvider, useWorkspaceConversationStores } from '~/workspace';
import { SidebarPanel } from '~/workspace/SidebarPanel';

export const WORKSPACE = '/Users/tester/workspace';

type RenderSidebarOptions = {
  workspacePath?: string;
  openThreadIds?: string[];
};

type OpenThreadsController = {
  open: (threadId: string) => Promise<void>;
} | null;

let openConversationsController: OpenThreadsController = null;

const OpenConversationsInitializer = ({
  threadIds,
}: {
  threadIds: string[];
}) => {
  const { loadThread } = useWorkspaceConversationStores();

  useEffect(() => {
    threadIds.forEach((threadId) => {
      void loadThread(threadId, { force: true });
    });
  }, [threadIds, loadThread]);

  useEffect(() => {
    openConversationsController = {
      open: async (threadId: string) => {
        await loadThread(threadId, { force: true });
      },
    };

    return () => {
      openConversationsController = null;
    };
  }, [loadThread]);

  return null;
};

export const markThreadOpenInTest = async (threadId: string) => {
  if (!openConversationsController) {
    throw new Error(
      'renderSidebarPanel must be called before marking sessions open'
    );
  }

  await act(async () => {
    await openConversationsController?.open(threadId);
  });
};

export const renderSidebarPanel = (options: RenderSidebarOptions = {}) => {
  const { workspacePath = WORKSPACE, openThreadIds = [] } = options;

  return renderWithProviders(
    <WorkspaceProvider workspacePath={workspacePath}>
      <ConversationProvider workspacePath={workspacePath}>
        <SidebarProvider>
          <Sidebar collapsible="none">
            <SidebarContent>
              <OpenConversationsInitializer threadIds={openThreadIds} />
              <SidebarPanel />
            </SidebarContent>
          </Sidebar>
        </SidebarProvider>
      </ConversationProvider>
    </WorkspaceProvider>
  );
};
