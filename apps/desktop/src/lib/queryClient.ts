import { QueryClient } from '@tanstack/react-query';

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { refetchOnWindowFocus: false, retry: 2, staleTime: 5_000 },
      mutations: { retry: 0 },
    },
  });
}
