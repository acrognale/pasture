// oxlint-disable no-unused-vars
import { createFileRoute } from '@tanstack/react-router';
import cuid from 'cuid';
import { z } from 'zod';

import {
  deriveModelFromTranscript,
  deriveReasoningEffortFromTranscript,
} from '@/lib/transcript';

const TranscriptCellSchema = z
  .object({
    id: z.string(),
    timestamp: z.string(),
    kind: z.string(),
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

const ReasoningEffortSchema = z.enum([
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
]);

export const ShareRequestSchema = z.object({
  title: z.string().trim().max(200).optional(),
  model: z.string().trim().max(120).optional(),
  reasoningEffort: ReasoningEffortSchema.optional(),
  transcript: TranscriptSchema,
});

const normalizeTitle = (value?: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Truncate large output to first 100 and last 100 lines
 */
const truncateOutput = (output: string, maxLines = 200): string => {
  const lines = output.split('\n');
  if (lines.length <= maxLines) {
    return output;
  }

  const half = maxLines / 2;
  const firstLines = lines.slice(0, half);
  const lastLines = lines.slice(-half);
  const omittedCount = lines.length - maxLines;

  return [
    ...firstLines,
    `\n... [${omittedCount} lines omitted] ...\n`,
    ...lastLines,
  ].join('\n');
};

/**
 * Clean up transcript data by removing fields that are only needed during execution,
 * not for display. This significantly reduces storage size.
 */
const cleanTranscriptForStorage = (transcript: any): any => {
  const cleaned = {
    turns: {} as any,
    turnOrder: transcript.turnOrder,
  };

  for (const [turnId, turn] of Object.entries(transcript.turns)) {
    const turnData = turn as any;
    cleaned.turns[turnId] = {
      ...turnData,
      cells: turnData.cells.map((cell: any) => {
        // Copy the cell so we can strip execution-only fields without mutating the original
        const rest = { ...cell };

        delete rest.outputChunks;
        delete rest.formattedOutput;
        delete rest.eventIds;
        delete rest.streaming;
        delete rest.stdout; // Remove stdout, aggregatedOutput has everything
        delete rest.stderr; // Remove stderr, aggregatedOutput has everything

        // Truncate large aggregatedOutput
        if (
          rest.aggregatedOutput &&
          typeof rest.aggregatedOutput === 'string'
        ) {
          rest.aggregatedOutput = truncateOutput(rest.aggregatedOutput);
        }

        return rest;
      }),
    };
  }

  return cleaned;
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
      GET: async ({ request, context }) => {
        const db = context.db();
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
              headers: { 'content-type': 'application/json', ...corsHeaders },
            }
          );
        }

        return new Response(JSON.stringify(share), {
          status: 200,
          headers: { 'content-type': 'application/json', ...corsHeaders },
        });
      },
      POST: async ({ request, context }) => {
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

        const db = context.db();

        const normalizedTitle = normalizeTitle(validated.data.title);
        const transcript = validated.data.transcript;
        const derivedModel =
          validated.data.model ?? deriveModelFromTranscript(transcript);
        const derivedReasoningEffort =
          validated.data.reasoningEffort ??
          deriveReasoningEffortFromTranscript(transcript);

        // Clean the transcript to remove execution-only data before storage
        const cleanedTranscript = cleanTranscriptForStorage(transcript);

        const created = await db
          .insertInto('SharedThread')
          .values({
            id: cuid(),
            title: normalizedTitle,
            model: derivedModel ?? null,
            reasoningEffort: derivedReasoningEffort ?? null,
            transcript: cleanedTranscript as unknown,
          })
          .returning(['id', 'title'])
          .executeTakeFirst();

        if (!created) {
          return new Response(
            JSON.stringify({
              error: 'Unable to create share',
            }),
            {
              status: 500,
              headers: { 'content-type': 'application/json', ...corsHeaders },
            }
          );
        }

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
