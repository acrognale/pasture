import type { AuthState } from '~/codex.gen/AuthState';

const defaultAuthState: AuthState = {
  isAuthenticated: true,
  mode: 'api-key',
  email: 'codex@example.com',
  planType: 'storybook',
  requiresAuth: false,
  lastError: null,
};

export const useAuthState = () => ({
  data: defaultAuthState,
  isLoading: false,
  isError: false,
  error: null as Error | null,
});
