import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import type { Prisma } from '../../generated/prisma/client';

const TranscriptCellSchema = z
  .object({
    id: z.string(),
    timestamp: z.string(),
    kind: z.string(),
    // Everything else is left open for now; we only require the basics to render.
  })
  .passthrough();

const TranscriptTurnSchema = z.object({
  id: z.string(),
  status: z.enum(['active', 'completed', 'aborted']).optional(),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  cells: z.array(TranscriptCellSchema),
});

const TranscriptSchema = z.object({
  turns: z.record(z.string(), TranscriptTurnSchema),
  turnOrder: z.array(z.string()),
});

export const ShareRequestSchema = z.object({
  title: z.string().trim().max(200).optional(),
  model: z.string().trim().max(120).optional(),
  transcript: TranscriptSchema,
});

const normalizeTitle = (value?: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'OPTIONS, POST, GET',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const Route = createFileRoute('/api/share')({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: corsHeaders,
        }),
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        const id = url.searchParams.get('id');
        if (!id) {
          return new Response(
            JSON.stringify({
              error: 'Missing id',
            }),
            {
              status: 400,
              headers: { 'content-type': 'application/json', ...corsHeaders },
            }
          );
        }

        const { db } = await import('@/lib/db');
        const share = await db.sharedThread.findUnique({
          where: { id },
        });

        if (!share) {
          return new Response(
            JSON.stringify({
              error: 'Not found',
            }),
            {
              status: 404,
              headers: { 'content-type': 'application/json', ...corsHeaders },
            }
          );
        }

        return new Response(JSON.stringify(share), {
          status: 200,
          headers: { 'content-type': 'application/json', ...corsHeaders },
        });
      },
      POST: async ({ request }: { request: Request }) => {
        const body = await request.json();
        const validated = ShareRequestSchema.safeParse(body);
        if (!validated.success) {
          return new Response(
            JSON.stringify({
              error: 'Invalid request',
              issues: validated.error.issues,
            }),
            {
              status: 400,
              headers: { 'content-type': 'application/json', ...corsHeaders },
            }
          );
        }

        const { db } = await import('@/lib/db');

        const normalizedTitle = normalizeTitle(validated.data.title);

        const created = await db.sharedThread.create({
          data: {
            title: normalizedTitle,
            model: validated.data.model ?? null,
            transcript: validated.data.transcript as Prisma.InputJsonValue,
          },
          select: {
            id: true,
            title: true,
          },
        });

        return new Response(
          JSON.stringify({
            id: created.id,
            url: `/s/${created.id}`,
          }),
          {
            status: 201,
            headers: { 'content-type': 'application/json', ...corsHeaders },
          }
        );
      },
    },
  },
  // No client component needed; this route is API-only.
});
