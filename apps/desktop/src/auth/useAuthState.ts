import { useQuery } from '@tanstack/react-query';
import type { AuthState } from '~/codex.gen/AuthState';
import { Codex } from '~/codex/client';

const AUTH_QUERY_KEY = ['auth'] as const;

export const useAuthState = () => {
  return useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: async (): Promise<AuthState> => {
      try {
        return await Codex.getAuthState();
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return {
          isAuthenticated: false,
          mode: null,
          email: null,
          planType: null,
          requiresAuth: true,
          lastError: reason,
        };
      }
    },
    staleTime: Infinity,
  });
};
