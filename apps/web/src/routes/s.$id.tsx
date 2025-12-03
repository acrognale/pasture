import type { TranscriptState } from '@pasture/transcript-ui';
import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import z from 'zod';

import { TranscriptView } from '@/components/transcript/TranscriptView';

type SharedTranscript = Pick<TranscriptState, 'turns' | 'turnOrder'>;

type SharedThreadDTO = {
  id: string;
  title: string | null;
  model: string | null;
  transcript: SharedTranscript;
  createdAt: string;
};

const getThread = createServerFn()
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ context, data }) => {
    const db = context.db();

    const result = await db
      .selectFrom('SharedThread')
      .selectAll()
      .where('id', '=', data.id)
      .executeTakeFirst();
    if (!result) {
      throw new Response('Not found', { status: 404 });
    }
    return {
      id: result.id,
      title: result.title,
      model: result.model,
      transcript: result.transcript as unknown as TranscriptState,
      createdAt: new Date(result.createdAt).toISOString(),
    };
  });

export const Route = createFileRoute('/s/$id')({
  loader: async ({ params }) => {
    return getThread({
      data: {
        id: params.id,
      },
    });
  },
  head: ({ loaderData, params }) => {
    const data = loaderData as SharedThreadDTO | undefined;
    const title = data?.title ?? 'Shared Thread';
    const description = data?.model
      ? `A conversation with ${data.model} shared on Pasture`
      : 'A shared conversation on Pasture';
    const ogImageUrl = `https://pasture.dev/api/og/${params.id}`;
    const shareUrl = `https://pasture.dev/s/${params.id}`;

    return {
      meta: [
        { title: `${title} - Pasture` },
        { name: 'description', content: description },
        // OpenGraph tags
        { property: 'og:type', content: 'article' },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:image', content: ogImageUrl },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:url', content: shareUrl },
        { property: 'og:site_name', content: 'Pasture' },
        // Twitter Card tags
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
        { name: 'twitter:image', content: ogImageUrl },
      ],
    };
  },
  component: RouteComponent,
  errorComponent: ErrorComponent,
  pendingComponent: LoadingComponent,
});

function LoadingComponent() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <svg
            className="w-12 h-12 text-brand"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 3a3 3 0 0 0-3 3v12" />
            <path d="M15 6a3 3 0 0 1 3-3h1" />
            <path d="M15 21v-3" />
          </svg>
        </div>
        <p className="font-body text-muted-foreground italic">
          Gathering the thread…
        </p>
      </div>
    </div>
  );
}

function RouteComponent() {
  const share = Route.useLoaderData() as SharedThreadDTO;
  const transcript = share.transcript as TranscriptState;
  const formattedDate = formatRelativeDate(share.createdAt);

  return (
    <div className="bg-background text-foreground">
      {/* Hero section with pastoral background */}
      <div className="hills-bg relative">
        <div className="max-w-4xl mx-auto px-6 pt-8 pb-16 md:pt-10 md:pb-20">
          {/* Byline */}
          <div>
            <p className="font-body text-sm tracking-widest uppercase text-brand mb-3">
              Shared Conversation
            </p>
          </div>

          {/* Title */}
          <h1 className="font-display text-2xl md:text-3xl lg:text-4xl font-medium text-foreground leading-tight mb-4">
            {share.title ?? (
              <span className="italic text-muted-foreground">
                Untitled Thread
              </span>
            )}
          </h1>

          {/* Meta + CTA row */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {share.model ? (
                <MetaPill icon={<ModelIcon />} label={share.model} />
              ) : null}
              <span className="font-body text-sm text-muted-foreground italic">
                {formattedDate}
              </span>
            </div>

            {/* CTA */}
            <a
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand text-brand-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <span>Try Pasture</span>
              <span className="text-white/70">→</span>
            </a>
          </div>
        </div>

        {/* Rolling hills divider */}
        <div className="absolute bottom-0 left-0 right-0 h-12 overflow-hidden">
          <svg
            className="absolute bottom-0 w-full h-16"
            viewBox="0 0 1200 120"
            preserveAspectRatio="none"
            fill="var(--background)"
          >
            <path d="M0,60 C200,100 400,20 600,60 C800,100 1000,20 1200,60 L1200,120 L0,120 Z" />
          </svg>
        </div>
      </div>

      {/* Transcript section */}
      <main className="relative -mt-4 z-10">
        <div className="max-w-4xl mx-auto px-6">
          {/* Editorial decorative line */}
          <div className="flex items-center gap-4 mb-8">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
            <SheepIcon className="w-6 h-6 text-brand opacity-60" />
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
          </div>

          {/* Transcript container */}
          <article>
            <TranscriptView transcript={transcript} showBorder={false} />
          </article>

          {/* Footer */}
          <footer className="mt-12 mb-8">
            <div className="flex items-center justify-center gap-2 py-6 border-t border-border text-sm text-muted-foreground">
              <span>Shared via</span>
              <a
                href="/"
                className="inline-flex items-center gap-1.5 font-medium text-foreground hover:text-brand transition-colors"
              >
                <img
                  src="/logo-48.png"
                  srcSet="/logo-48.png 1x, /logo-96.png 2x"
                  width={20}
                  height={20}
                  alt=""
                  className="w-5 h-5 rounded"
                />
                <span>Pasture</span>
              </a>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}

function MetaPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-cream border border-brand/20 text-sm font-mono text-foreground/80">
      <span className="text-brand">{icon}</span>
      {label}
    </span>
  );
}

function ModelIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z" />
      <path d="M12 12v10" />
      <path d="M8 18h8" />
    </svg>
  );
}

function SheepIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Fluffy body */}
      <ellipse cx="12" cy="14" rx="7" ry="5" />
      {/* Head */}
      <circle cx="6" cy="11" r="3" />
      {/* Ears */}
      <ellipse cx="4" cy="9" rx="1" ry="1.5" />
      {/* Legs */}
      <line x1="9" y1="19" x2="9" y2="22" />
      <line x1="15" y1="19" x2="15" y2="22" />
      {/* Eye */}
      <circle cx="5" cy="10.5" r="0.5" fill="currentColor" />
    </svg>
  );
}

function formatRelativeDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'Shared today';
  } else if (diffDays === 1) {
    return 'Shared yesterday';
  } else if (diffDays < 7) {
    return `Shared ${diffDays} days ago`;
  } else {
    return `Shared on ${date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    })}`;
  }
}

function ErrorComponent({ error }: { error: unknown }) {
  if (error instanceof Response && error.status === 404) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center px-6">
        <div className="max-w-md text-center">
          {/* Lost sheep illustration */}
          <div className="mb-8">
            <div className="relative inline-block">
              <SheepIcon className="w-24 h-24 text-muted-foreground/30" />
              <span className="absolute -top-2 -right-2 text-3xl">?</span>
            </div>
          </div>

          <h2 className="font-display text-3xl md:text-4xl font-medium text-foreground mb-4">
            Thread Not Found
          </h2>
          <p className="font-body text-muted-foreground mb-8">
            This conversation seems to have wandered off.
            <br />
            It may have been removed or never existed.
          </p>
          <a
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-brand text-brand-foreground font-medium text-sm hover:opacity-90 transition-opacity animate-fade-up delay-300"
          >
            <span>Return to pasture</span>
            <span>→</span>
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="mb-8">
          <div className="w-16 h-16 mx-auto rounded-full bg-error/10 flex items-center justify-center">
            <span className="text-2xl">⚠</span>
          </div>
        </div>
        <h2 className="font-display text-2xl font-medium text-foreground mb-4">
          Something Went Wrong
        </h2>
        <pre className="font-mono text-xs text-muted-foreground bg-muted/50 rounded-lg p-4 overflow-auto max-w-full">
          {error instanceof Error ? error.message : 'Unknown error'}
        </pre>
      </div>
    </div>
  );
}
