import handler, { createServerEntry } from '@tanstack/react-start/server-entry';

import { createDb } from './lib/db';

declare module '@tanstack/react-start' {
  interface Register {
    server: {
      requestContext: {
        db: () => Awaited<ReturnType<typeof createDb>>;
      };
    };
  }
}

export default createServerEntry({
  async fetch(request) {
    let dbInstance: Awaited<ReturnType<typeof createDb>> | undefined;
    const db = () => (dbInstance ??= createDb());
    return handler.fetch(request, { context: { db } });
  },
});
