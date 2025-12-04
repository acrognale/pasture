import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/raw/$id')({
  server: {
    handlers: {
      GET: async ({ params, context }) => {
        const db = context.db();
        const { id } = params;

        const share = await db
          .selectFrom('SharedThread')
          .selectAll()
          .where('id', '=', id)
          .executeTakeFirst();

        if (!share) {
          return new Response(
            JSON.stringify({
              error: 'Not found',
            }),
            {
              status: 404,
              headers: { 'content-type': 'application/json' },
            }
          );
        }

        // Return as downloadable JSON
        return new Response(JSON.stringify(share, null, 2), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'content-disposition': `attachment; filename="shared-thread-${id}.json"`,
          },
        });
      },
    },
  },
});
