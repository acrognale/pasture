import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: () => <div>Redirecting...</div>,
  server: {
    handlers: {
      GET: () => {
        return Response.redirect(
          new URL('https://github.com/acrognale/pasture'),
          307
        );
      },
    },
  },
});
