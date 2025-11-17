import { Outlet, createFileRoute } from '@tanstack/react-router';
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
import { WorkspaceProvider } from '~/workspace';
import { SidebarPanel } from '~/workspace/SidebarPanel';

export const Route = createFileRoute('/workspaces/$workspaceId')({
  component: RouteComponent,
});

function RouteComponent() {
  const { workspaceId } = Route.useParams();
  const [isResizing] = useState(false);

  const workspacePath = decodeWorkspaceId(workspaceId);

  useEffect(() => {
    if (!isTauriEnvironment()) {
      return;
    }

    void Codex.setWindowTitle({ title: workspacePath });
  }, [workspacePath]);

  return (
    <WorkspaceProvider workspacePath={workspacePath}>
      <ConversationProvider workspacePath={workspacePath}>
        <SidebarProvider
          className="bg-background text-foreground h-full w-full"
          style={
            {
              '--sidebar-width-icon': '3rem',
            } as React.CSSProperties
          }
          defaultOpen={true}
        >
          <Sidebar
            className={`border-border/60 bg-card ${isResizing ? 'transition-none' : ''}`}
          >
            <SidebarPanel />
            {/* TODO: Add resize handle component */}
          </Sidebar>
          <SidebarInset className="h-full overflow-hidden">
            <div className="flex h-full flex-col -mx-px">
              <Outlet />
            </div>
          </SidebarInset>
        </SidebarProvider>
      </ConversationProvider>
    </WorkspaceProvider>
  );
}
