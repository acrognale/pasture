import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { SidebarProvider } from '~/components/ui/sidebar';
import { ShortcutProvider } from '~/keyboard/ShortcutProvider';

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
};

export const renderWithProviders = (
  ui: ReactElement,
  options: RenderWithProvidersOptions = {}
) => {
  const queryClient = options.queryClient ?? createTestQueryClient();

  const Wrapper = ({ children }: { children?: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ShortcutProvider>
        <SidebarProvider defaultOpen>{children}</SidebarProvider>
      </ShortcutProvider>
    </QueryClientProvider>
  );

  const result = render(ui, { wrapper: Wrapper });

  return {
    ...result,
    queryClient,
  };
};
