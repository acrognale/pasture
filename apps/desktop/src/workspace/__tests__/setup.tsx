import { act } from '@testing-library/react';
import { useEffect } from 'react';
import {
  Sidebar,
  SidebarContent,
  SidebarProvider,
} from '~/components/ui/sidebar';
import { ConversationProvider } from '~/conversation/store';
import { NavigationProvider } from '~/navigation/NavigationProvider';
import { PanelManagerProvider } from '~/panels/PanelManagerProvider';
import { usePanelManagerStore } from '~/panels/PanelManagerProvider';
import { getConversationHostId } from '~/panels/host-ids';
import { renderWithProviders } from '~/testing/harness';
import { WorkspaceProvider, useWorkspaceActions } from '~/workspace';
import { SidebarPanel } from '~/workspace/SidebarPanel';

import { registerConversationPanels } from '~/conversation/panels/register';

export const WORKSPACE = '/Users/tester/workspace';

registerConversationPanels();

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
  workspacePath,
}: {
  threadIds: string[];
  workspacePath: string;
}) => {
  const { loadThread } = useWorkspaceActions();
  const panelManagerStore = usePanelManagerStore();

  useEffect(() => {
    void (async () => {
      for (const threadId of threadIds) {
        const conversationId = await loadThread(threadId, { force: true });
        if (!conversationId) continue;
        const hostId = getConversationHostId(workspacePath);
        panelManagerStore.getState().actions.open(hostId, 'editor', 'conversation.thread', {
          workspacePath,
          conversationId,
          threadId,
          threadTitle: null,
        });
      }
    })();
  }, [panelManagerStore, threadIds, loadThread, workspacePath]);

  useEffect(() => {
    openConversationsController = {
      open: async (threadId: string) => {
        const conversationId = await loadThread(threadId, { force: true });
        if (!conversationId) {
          return;
        }
        const hostId = getConversationHostId(workspacePath);
        panelManagerStore.getState().actions.open(hostId, 'editor', 'conversation.thread', {
          workspacePath,
          conversationId,
          threadId,
          threadTitle: null,
        });
      },
    };

    return () => {
      openConversationsController = null;
    };
  }, [loadThread, panelManagerStore, workspacePath]);

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
      <PanelManagerProvider>
        <NavigationProvider>
          <ConversationProvider workspacePath={workspacePath}>
            <SidebarProvider>
              <Sidebar collapsible="none">
                <SidebarContent>
                  <OpenConversationsInitializer
                    threadIds={openThreadIds}
                    workspacePath={workspacePath}
                  />
                  <SidebarPanel />
                </SidebarContent>
              </Sidebar>
            </SidebarProvider>
          </ConversationProvider>
        </NavigationProvider>
      </PanelManagerProvider>
    </WorkspaceProvider>
  );
};
