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
  openConversationIds?: string[];
};

type OpenConversationsController = {
  open: (conversationId: string) => Promise<void>;
} | null;

let openConversationsController: OpenConversationsController = null;

const OpenConversationsInitializer = ({
  conversationIds,
}: {
  conversationIds: string[];
}) => {
  const { loadConversation } = useWorkspaceConversationStores();

  useEffect(() => {
    conversationIds.forEach((conversationId) => {
      void loadConversation(conversationId, { force: true });
    });
  }, [conversationIds, loadConversation]);

  useEffect(() => {
    openConversationsController = {
      open: async (conversationId: string) => {
        await loadConversation(conversationId, { force: true });
      },
    };

    return () => {
      openConversationsController = null;
    };
  }, [loadConversation]);

  return null;
};

export const markConversationOpenInTest = async (conversationId: string) => {
  if (!openConversationsController) {
    throw new Error(
      'renderSidebarPanel must be called before marking sessions open'
    );
  }

  await act(async () => {
    await openConversationsController?.open(conversationId);
  });
};

export const renderSidebarPanel = (options: RenderSidebarOptions = {}) => {
  const { workspacePath = WORKSPACE, openConversationIds = [] } = options;

  return renderWithProviders(
    <WorkspaceProvider workspacePath={workspacePath}>
      <ConversationProvider workspacePath={workspacePath}>
        <SidebarProvider>
          <Sidebar collapsible="none">
            <SidebarContent>
              <OpenConversationsInitializer
                conversationIds={openConversationIds}
              />
              <SidebarPanel />
            </SidebarContent>
          </Sidebar>
        </SidebarProvider>
      </ConversationProvider>
    </WorkspaceProvider>
  );
};
