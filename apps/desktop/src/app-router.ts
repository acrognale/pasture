import { createMemoryHistory, createRouter } from '@tanstack/react-router';
import type { RouterHistory } from '@tanstack/react-router';

import { routeTree } from './routeTree.gen';

type CreateRouterOptions = {
  history?: RouterHistory;
};

const buildRouter = (options?: CreateRouterOptions) =>
  createRouter({
    routeTree,
    history: options?.history,
  });

export type AppRouter = ReturnType<typeof buildRouter>;

export const createAppRouter = (options?: CreateRouterOptions): AppRouter =>
  buildRouter(options);

export const router: AppRouter = createAppRouter();

export const createTestRouter = (initialEntries?: string[]): AppRouter => {
  if (initialEntries && initialEntries.length > 0) {
    return createAppRouter({
      history: createMemoryHistory({ initialEntries }),
    });
  }

  return createAppRouter({
    history: createMemoryHistory(),
  });
};

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}
