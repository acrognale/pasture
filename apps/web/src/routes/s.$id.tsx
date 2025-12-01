import { createFileRoute } from '@tanstack/react-router';

import { TranscriptView } from '@/components/transcript/TranscriptView';
import type { SharedTranscriptState } from '@/types/sharedTranscript';
import type { SharedThread } from '../../generated/prisma/client';

type SharedThreadDTO = {
  id: string;
  title: string | null;
  model: string | null;
  transcript: SharedTranscriptState;
  createdAt: string;
};

export const Route = createFileRoute('/s/$id')({
  loader: async ({ params }): Promise<SharedThreadDTO> => {
    const { db } = await import('@/lib/db');
    const result: SharedThread | null = await db.sharedThread.findUnique({
      where: { id: params.id },
    });
    if (!result) {
      throw new Response('Not found', { status: 404 });
    }
    return {
      id: result.id,
      title: result.title,
      model: result.model,
      transcript: result.transcript as SharedTranscriptState,
      createdAt: result.createdAt.toISOString(),
    };
  },
  component: RouteComponent,
  errorComponent: ErrorComponent,
  pendingComponent: () => (
    <div className="flex min-h-[50vh] items-center justify-center text-slate-500">
      Loading shared thread…
    </div>
  ),
});

function RouteComponent() {
  const share = Route.useLoaderData() as SharedThreadDTO;
  const transcript = share.transcript as SharedTranscriptState;
  const turnCount = transcript.turnOrder.length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 text-slate-50">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-12">
        <header className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-slate-800 ring-1 ring-white/10" />
            <div>
              <p className="text-sm uppercase tracking-wide text-slate-400">
                Shared via Pasture
              </p>
              <h1 className="text-2xl font-semibold text-white">
                {share.title ?? 'Shared thread'}
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
            {share.model ? <Badge label={share.model} /> : null}
            <Badge
              label={`${turnCount} turn${turnCount === 1 ? '' : 's'}`}
            />
            <Badge
              label={new Date(share.createdAt).toLocaleString()}
            />
          </div>
        </header>

        <main>
          <TranscriptView transcript={transcript} />
        </main>

        <footer className="text-sm text-slate-400">
          <a
            className="underline decoration-slate-500 underline-offset-4 hover:text-white"
            href="/"
          >
            Learn about Pasture
          </a>
        </footer>
      </div>
    </div>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white ring-1 ring-white/10">
      {label}
    </span>
  );
}

function ErrorComponent({ error }: { error: unknown }) {
  if (error instanceof Response && error.status === 404) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 bg-slate-950 text-slate-100">
        <h2 className="text-2xl font-semibold">Thread not found</h2>
        <p className="text-slate-400">
          This shared thread doesn&apos;t exist or may have been removed.
        </p>
        <a
          href="/"
          className="rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/10 hover:bg-white/15"
        >
          Go home
        </a>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 bg-slate-950 text-slate-100">
      <h2 className="text-2xl font-semibold">Something went wrong</h2>
      <pre className="text-xs text-slate-400">
        {error instanceof Error ? error.message : 'Unknown error'}
      </pre>
    </div>
  );
}
