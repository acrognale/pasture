import {
  Outlet,
  createFileRoute,
  useRouterState,
} from '@tanstack/react-router';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import {
  PanelManagerProvider,
  usePanelManagerStore,
} from '~/panels/PanelManagerProvider';
import { findActiveInstanceIdInDockLayout } from '~/panels/active-tab';
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
const DEFAULT_SIDEBAR_WIDTH = 288;
const MIN_SIDEBAR_WIDTH = 220;

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
  const [isResizing, setIsResizing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const panelManagerStore = usePanelManagerStore();
  const sidebarStorageKey = useMemo(
    () => `pasture.sidebar.width:${workspacePath}`,
    [workspacePath]
  );
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_SIDEBAR_WIDTH;
    const max = Math.max(MIN_SIDEBAR_WIDTH, window.innerWidth - 320);
    const clamp = (width: number) =>
      Math.max(MIN_SIDEBAR_WIDTH, Math.min(max, width));
    try {
      const stored = window.localStorage.getItem(sidebarStorageKey);
      const parsed = stored ? Number(stored) : NaN;
      if (Number.isFinite(parsed) && parsed > 0) {
        return clamp(parsed);
      }
    } catch {
      // ignore
    }
    return clamp(DEFAULT_SIDEBAR_WIDTH);
  });

  const clampSidebarWidth = useCallback((width: number) => {
    if (typeof window === 'undefined') {
      return Math.max(MIN_SIDEBAR_WIDTH, width);
    }
    const max = Math.max(MIN_SIDEBAR_WIDTH, window.innerWidth - 320);
    return Math.max(MIN_SIDEBAR_WIDTH, Math.min(max, width));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(sidebarStorageKey, String(sidebarWidth));
    } catch {
      // ignore
    }
  }, [sidebarStorageKey, sidebarWidth]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      setSidebarWidth((current) => clampSidebarWidth(current));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [clampSidebarWidth]);

  useEffect(() => {
    if (!isTauriEnvironment()) {
      return;
    }

    const handleCloseRequested = async () => {
      const active =
        typeof document !== 'undefined' ? document.activeElement : null;
      const target = active instanceof Element ? active : null;
      const panelHostElement = target?.closest?.(
        '[data-panel-host-id][data-panel-dock-id]'
      );

      if (panelHostElement) {
        const hostId = panelHostElement.getAttribute('data-panel-host-id');
        const dockId = panelHostElement.getAttribute('data-panel-dock-id');

        if (hostId && (dockId === 'editor' || dockId === 'utility')) {
          const state = panelManagerStore.getState();
          const host = state.hosts[hostId];
          const dock = host?.docks[dockId] ?? null;

          const instanceId = findActiveInstanceIdInDockLayout(
            dock?.root ?? null,
            dock?.focusedGroupId ?? null
          );

          if (instanceId) {
            state.actions.close(hostId, instanceId);
            return;
          }
        }
      }

      {
        const state = panelManagerStore.getState();
        const lastFocused = state.lastFocusedDock;
        if (lastFocused) {
          const host = state.hosts[lastFocused.hostId];
          const dock = host?.docks[lastFocused.dockId] ?? null;
          const instanceId = findActiveInstanceIdInDockLayout(
            dock?.root ?? null,
            dock?.focusedGroupId ?? null
          );
          if (instanceId) {
            state.actions.close(lastFocused.hostId, instanceId);
            return;
          }
        }
      }

      try {
        await getCurrentWindow().close();
      } catch (error) {
        console.warn('Failed to close window after close request', error);
      }
    };

    const unlistenPromise = listen('app:close-requested', () => {
      void handleCloseRequested();
    });

    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [panelManagerStore]);

  const handleSidebarResizeStart = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsResizing(true);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        setSidebarWidth(clampSidebarWidth(moveEvent.clientX));
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [clampSidebarWidth]
  );

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
          '--sidebar-width': `${sidebarWidth}px`,
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
            <div className="relative flex h-full w-full">
              <div className="min-w-0 flex-1">
                <SidebarPanel onOpenSettings={() => setSettingsOpen(true)} />
              </div>
              <div
                className="group-data-[state=collapsed]:hidden absolute inset-y-0 right-0 w-2 cursor-col-resize bg-transparent"
                onMouseDown={handleSidebarResizeStart}
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize sidebar"
              >
                <div className="absolute inset-y-0 right-0 w-px bg-border/60" />
              </div>
            </div>
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
