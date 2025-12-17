import type { AuthState } from '@pasture/protocol';
import { QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { useEffect, useMemo } from 'react';
import { createAppQueryClient } from '~/lib/queryClient';
import { NavigationProvider } from '~/navigation/NavigationProvider';
import { PanelManagerProvider } from '~/panels/PanelManagerProvider';
import { WorkspaceProvider } from '~/workspace';

import { mockCodexControls, sampleWorkspacePath } from './state';

const DEFAULT_AUTH: AuthState = {
  isAuthenticated: true,
  mode: 'api-key',
  email: 'codex@example.com',
  planType: 'storybook',
  requiresAuth: false,
  lastError: null,
};

type StorybookProvidersProps = PropsWithChildren<{
  workspacePath?: string;
  authState?: AuthState;
}>;

export const StorybookProviders = ({
  workspacePath = sampleWorkspacePath,
  authState = DEFAULT_AUTH,
  children,
}: StorybookProvidersProps) => {
  const queryClient = useMemo(() => createAppQueryClient(), []);

  useEffect(() => {
    queryClient.setQueryData(['auth'], authState);
  }, [authState, queryClient]);

  useEffect(() => {
    mockCodexControls.setWorkspacePath(workspacePath);
  }, [workspacePath]);

  return (
    <QueryClientProvider client={queryClient}>
      <WorkspaceProvider workspacePath={workspacePath}>
        <PanelManagerProvider>
          <NavigationProvider>{children}</NavigationProvider>
        </PanelManagerProvider>
      </WorkspaceProvider>
    </QueryClientProvider>
  );
};
