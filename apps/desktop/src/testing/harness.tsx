import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { useEffect } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { SidebarProvider } from '~/components/ui/sidebar';
import { ShortcutProvider } from '~/keyboard/ShortcutProvider';
import { PanelManagerProvider } from '~/panels/PanelManagerProvider';

export const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });

type RenderWithProvidersOptions = {
  queryClient?: QueryClient;
  routerInitialEntries?: string[];
};

const createHarnessRouter = (initialEntries?: string[]) => {
  const rootRoute = createRootRoute({
    component: () => null,
  });

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  });

  const workspacesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/workspaces/$workspaceId',
    component: () => null,
  });

  const threadRoute = createRoute({
    getParentRoute: () => workspacesRoute,
    path: '/threads/$threadId',
    component: () => null,
  });

  const routeTree = rootRoute.addChildren([
    indexRoute,
    workspacesRoute.addChildren([threadRoute]),
  ]);

  return createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: initialEntries && initialEntries.length > 0 ? initialEntries : ['/'],
    }),
  });
};

export const renderWithProviders = (
  ui: ReactElement,
  options: RenderWithProvidersOptions = {}
) => {
  const queryClient = options.queryClient ?? createTestQueryClient();
  const router = createHarnessRouter(options.routerInitialEntries);

  const Wrapper = ({ children }: { children?: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ShortcutProvider>
        <SidebarProvider defaultOpen>
          <PanelManagerProvider>
            <TestRouterProvider router={router}>{children}</TestRouterProvider>
          </PanelManagerProvider>
        </SidebarProvider>
      </ShortcutProvider>
    </QueryClientProvider>
  );

  const result = render(ui, { wrapper: Wrapper });

  return {
    ...result,
    queryClient,
    router,
  };
};

function TestRouterProvider({
  router,
  children,
}: {
  router: ReturnType<typeof createHarnessRouter>;
  children?: ReactNode;
}) {
  useEffect(() => {
    const unsubscribe = router.history.subscribe(() => {
      void router.load();
    });
    void router.load();
    return () => {
      unsubscribe();
    };
  }, [router]);

  const routerForContext =
    router as unknown as Parameters<typeof RouterContextProvider>[0]['router'];

  return (
    <RouterContextProvider router={routerForContext}>
      {children}
    </RouterContextProvider>
  );
}
