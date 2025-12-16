import {
  Outlet,
  createFileRoute,
  useRouterState,
} from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Codex } from '~/codex/client';
import { isTauriEnvironment } from '~/codex/events';
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
} from '~/components/ui/sidebar';
import { ConversationProvider } from '~/conversation/store';
import { decodeWorkspaceId } from '~/lib/routing';
import { NavigationProvider } from '~/navigation/NavigationProvider';
import { PanelManagerProvider } from '~/panels/PanelManagerProvider';
import { SettingsModal } from '~/settings/SettingsModal';
import {
  WorkspaceProvider,
  useWorkspaceThreadConversationId,
} from '~/workspace';
import { RecentConversationSwitcher } from '~/workspace/RecentConversationSwitcher';
import { SidebarPanel } from '~/workspace/SidebarPanel';
import { WorkspaceConversationSwitcher } from '~/workspace/WorkspaceConversationSwitcher';
import { WorkspaceTopBar } from '~/workspace/WorkspaceTopBar';

export const Route = createFileRoute('/workspaces/$workspaceId')({
  component: RouteComponent,
});

const TOP_BAR_HEIGHT = '41px';

function RouteComponent() {
  const { workspaceId } = Route.useParams();
  const workspacePath = decodeWorkspaceId(workspaceId);

  useEffect(() => {
    if (!isTauriEnvironment()) {
      return;
    }

    void Codex.setWindowTitle({ title: workspacePath });
  }, [workspacePath]);

  return (
    <WorkspaceProvider workspacePath={workspacePath}>
      <PanelManagerProvider>
        <NavigationProvider>
          <ConversationProvider workspacePath={workspacePath}>
            <WorkspaceShell workspacePath={workspacePath} />
          </ConversationProvider>
        </NavigationProvider>
      </PanelManagerProvider>
    </WorkspaceProvider>
  );
}

function WorkspaceShell({ workspacePath }: { workspacePath: string }) {
  const [isResizing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const threadMatch = useRouterState({
    select: (state) =>
      state.matches.find(
        (match) =>
          match.routeId === '/workspaces/$workspaceId/threads/$threadId'
      ),
  });

  const activeThreadId =
    typeof threadMatch?.params?.threadId === 'string'
      ? threadMatch.params.threadId
      : null;

  const activeConversationId = useWorkspaceThreadConversationId(activeThreadId);

  return (
    <SidebarProvider
      className="bg-background text-foreground h-full w-full"
      style={
        {
          '--sidebar-width-icon': '3rem',
          '--workspace-topbar-height': TOP_BAR_HEIGHT,
        } as React.CSSProperties
      }
      defaultOpen={true}
    >
      <div className="flex h-full w-full flex-col">
        <WorkspaceTopBar
          workspacePath={workspacePath}
          activeConversationId={activeConversationId}
          hasActiveThread={activeThreadId !== null}
        />
        <div className="flex flex-1 min-h-0">
          <Sidebar
            className={`border-border/60 bg-card ${isResizing ? 'transition-none' : ''}`}
            style={
              {
                '--sidebar-offset-top': 'var(--workspace-topbar-height)',
              } as React.CSSProperties
            }
          >
            <SidebarPanel onOpenSettings={() => setSettingsOpen(true)} />
            {/* TODO: Add resize handle component */}
          </Sidebar>
          <SidebarInset className="h-full overflow-hidden">
            <div className="flex h-full flex-col -mx-px">
              <Outlet />
            </div>
          </SidebarInset>
        </div>
      </div>
      <WorkspaceConversationSwitcher />
      <RecentConversationSwitcher />
      <SettingsModal
        workspacePath={workspacePath}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </SidebarProvider>
  );
}
