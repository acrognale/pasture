import {
  Sidebar,
  SidebarContent,
  SidebarProvider,
} from '~/components/ui/sidebar';
import { ConversationProvider } from '~/conversation/store';
import { renderWithProviders } from '~/testing/harness';
import { WorkspaceProvider } from '~/workspace';
import { SidebarPanel } from '~/workspace/SidebarPanel';

export const WORKSPACE = '/Users/tester/workspace';

type RenderSidebarOptions = {
  workspacePath?: string;
};

export const renderSidebarPanel = (options: RenderSidebarOptions = {}) => {
  const { workspacePath = WORKSPACE } = options;

  return renderWithProviders(
    <WorkspaceProvider workspacePath={workspacePath}>
      <ConversationProvider workspacePath={workspacePath}>
        <SidebarProvider>
          <Sidebar collapsible="none">
            <SidebarContent>
              <SidebarPanel />
            </SidebarContent>
          </Sidebar>
        </SidebarProvider>
      </ConversationProvider>
    </WorkspaceProvider>
  );
};
