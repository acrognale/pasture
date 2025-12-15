import type {
  ReviewMapCodeRef,
  ReviewMapConcept,
  ReviewMapOutputEvent,
  ReviewMapStep,
  ReviewMapTrace,
} from '@pasture/protocol';
import { cn } from '@pasture/theme';
import { useMemo, useState } from 'react';
import { Button } from '~/components/ui/button';
import {
  dispatchOpenRepoReviewOverlayEvent,
  dispatchOpenReviewOverlayEvent,
} from '~/conversation/events';

type ReviewMapOverlayProps = {
  onClose: () => void;
  conversationId: string;
  workspacePath?: string;
  status: 'idle' | 'running' | 'complete';
  output: ReviewMapOutputEvent | null;
  selectedStepId: string | null;
  onSelectStepId: (stepId: string | null) => void;
};

function formatLineRange(ref: ReviewMapCodeRef): string | null {
  if (!ref.line_range) return null;
  const { start, end } = ref.line_range;
  if (!start || !end) return null;
  if (start === end) return `L${start}`;
  return `L${start}–${end}`;
}

function stepLabel(step: ReviewMapStep): string {
  return step.title?.trim() ? step.title : step.id;
}

function traceLabel(trace: ReviewMapTrace): string {
  return trace.title?.trim() ? trace.title : trace.id;
}

export function ReviewMapOverlay({
  onClose,
  conversationId,
  workspacePath,
  status,
  output,
  selectedStepId,
  onSelectStepId,
}: ReviewMapOverlayProps) {
  const [collapsedTraces, setCollapsedTraces] = useState<Set<string>>(
    () => new Set()
  );

  const conceptsById = useMemo(() => {
    const map = new Map<string, ReviewMapConcept>();
    (output?.concepts ?? []).forEach((concept) => {
      map.set(concept.id, concept);
    });
    return map;
  }, [output]);

  const stepsById = useMemo(() => {
    const map = new Map<string, ReviewMapStep>();
    (output?.steps ?? []).forEach((step) => {
      map.set(step.id, step);
    });
    return map;
  }, [output]);

  const traces = useMemo<ReviewMapTrace[]>(() => output?.traces ?? [], [output]);

  const orderedStepIds = useMemo(() => {
    if (!output) return [];
    const fromTraces = traces.flatMap((trace) => trace.step_ids ?? []);
    if (fromTraces.length) return fromTraces;
    return (output.steps ?? []).map((s) => s.id);
  }, [output, traces]);

  const selectedStep = useMemo<ReviewMapStep | null>(() => {
    if (!output) return null;
    const fallbackId = orderedStepIds[0] ?? output.steps?.[0]?.id ?? null;
    const id = selectedStepId ?? fallbackId;
    if (!id) return null;
    return stepsById.get(id) ?? null;
  }, [orderedStepIds, output, selectedStepId, stepsById]);

  const selectedStepIndex = useMemo(() => {
    if (!selectedStep) return -1;
    return orderedStepIds.findIndex((id) => id === selectedStep.id);
  }, [orderedStepIds, selectedStep]);

  const prevStepId =
    selectedStepIndex > 0 ? orderedStepIds[selectedStepIndex - 1] ?? null : null;
  const nextStepId =
    selectedStepIndex >= 0
      ? orderedStepIds[selectedStepIndex + 1] ?? null
      : null;

  const selectedConcepts = useMemo(() => {
    if (!selectedStep?.concept_ids?.length) return [];
    return selectedStep.concept_ids
      .map((id) => conceptsById.get(id))
      .filter((concept): concept is ReviewMapConcept => Boolean(concept));
  }, [conceptsById, selectedStep]);

  const handleToggleTraceCollapsed = (traceId: string) => {
    setCollapsedTraces((current) => {
      const next = new Set(current);
      if (next.has(traceId)) {
        next.delete(traceId);
      } else {
        next.add(traceId);
      }
      return next;
    });
  };

  const openReview = (
    fileDisplayPath?: string,
    lineRange?: { start: number; end: number }
  ) => {
    // Review Map should target repo diffs (branch vs base) as canonical substrate.
    // If we don't know workspacePath (older callers), fall back to turn diffs.
    if (!workspacePath) {
      dispatchOpenReviewOverlayEvent(conversationId, fileDisplayPath, lineRange);
      return;
    }

    const defaultParams = {
      workspacePath,
      baseRef: 'main',
      targetRef: 'HEAD',
      includeWorktree: false,
    } as const;

    dispatchOpenRepoReviewOverlayEvent(
      conversationId,
      defaultParams,
      fileDisplayPath,
      lineRange
    );
  };

  return (
    <div
      data-review-map-pane="true"
      className="flex h-full w-full flex-col bg-background text-foreground"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.defaultPrevented) return;
        if (event.metaKey || event.ctrlKey || event.altKey) return;

        if (event.key === 'ArrowLeft' || event.key === 'k') {
          if (prevStepId) {
            event.preventDefault();
            onSelectStepId(prevStepId);
          }
        }
        if (event.key === 'ArrowRight' || event.key === 'j') {
          if (nextStepId) {
            event.preventDefault();
            onSelectStepId(nextStepId);
          }
        }
      }}
    >
      <div className="border-b border-border/60 px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground truncate">
              {output?.title?.trim()
                ? output.title
                : status === 'running'
                  ? 'Generating review map…'
                  : 'Review map'}
            </div>
            {output?.summary?.trim() ? (
              <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                {output.summary}
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => openReview()}
            >
              Open review
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            {!output ? (
              <div className="h-full w-full p-6">
                {status === 'running' ? (
                  <div className="rounded-md border border-border/60 bg-card p-4 text-sm text-muted-foreground">
                    Generating review map…
                  </div>
                ) : (
                  <div className="rounded-md border border-border/60 bg-card p-4 text-sm text-muted-foreground">
                    No review map available yet. Run{' '}
                    <span className="font-semibold">/review-map</span> to generate one.
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="min-w-0 shrink-0 border-b border-border/60 bg-card p-4 overflow-auto lg:w-[420px] lg:border-b-0 lg:border-r">
                  <div className="text-xs font-semibold text-muted-foreground">
                    Review trace
                  </div>
                  <div className="mt-3 space-y-3">
                    {traces.length ? (
                      traces.map((trace) => {
                        const isCollapsed = collapsedTraces.has(trace.id);
                        return (
                          <div
                            key={trace.id}
                            className="rounded-md border border-border/60 bg-background"
                          >
                            <button
                              type="button"
                              className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left"
                              onClick={() => handleToggleTraceCollapsed(trace.id)}
                            >
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-foreground truncate">
                                  {traceLabel(trace)}
                                </div>
                                {trace.summary?.trim() ? (
                                  <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                                    {trace.summary}
                                  </div>
                                ) : null}
                              </div>
                              <div className="shrink-0 text-xs text-muted-foreground">
                                {isCollapsed ? 'Show' : 'Hide'}
                              </div>
                            </button>

                            {!isCollapsed ? (
                              <div className="border-t border-border/60 p-2 space-y-1">
                                {(trace.step_ids ?? []).map((stepId) => {
                                  const step = stepsById.get(stepId);
                                  if (!step) return null;
                                  const isActive =
                                    (selectedStep?.id ?? null) === step.id;
                                  return (
                                    <button
                                      key={step.id}
                                      type="button"
                                      className={cn(
                                        'w-full rounded-md px-2 py-2 text-left text-sm transition',
                                        isActive
                                          ? 'bg-accent/60 text-foreground'
                                          : 'hover:bg-accent/40 text-foreground'
                                      )}
                                      onClick={() => onSelectStepId(step.id)}
                                    >
                                      <div className="flex items-start gap-2">
                                        <div className="mt-[1px] text-xs text-muted-foreground tabular-nums">
                                          {step.id}
                                        </div>
                                        <div className="min-w-0">
                                          <div className="truncate">
                                            {stepLabel(step)}
                                          </div>
                                          {step.rationale?.trim() ? (
                                            <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                                              {step.rationale}
                                            </div>
                                          ) : null}
                                        </div>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-md border border-border/60 bg-background p-3 text-sm text-muted-foreground">
                        No traces found in this review map output.
                      </div>
                    )}
                  </div>
                </div>

                <div className="min-w-0 flex-1 overflow-auto bg-background p-6">
                  {selectedStep ? (
                    <div className="max-w-3xl space-y-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-muted-foreground">
                            Step {selectedStep.id}
                          </div>
                          <div className="mt-1 text-lg font-semibold text-foreground">
                            {stepLabel(selectedStep)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={!prevStepId}
                            onClick={() =>
                              prevStepId && onSelectStepId(prevStepId)
                            }
                          >
                            Prev
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={!nextStepId}
                            onClick={() =>
                              nextStepId && onSelectStepId(nextStepId)
                            }
                          >
                            Next
                          </Button>
                        </div>
                      </div>

                      {selectedStep.rationale?.trim() ? (
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground">
                            Rationale
                          </div>
                          <div className="mt-2 text-sm text-foreground whitespace-pre-wrap">
                            {selectedStep.rationale}
                          </div>
                        </div>
                      ) : null}

                      {selectedStep.suggested_questions?.length ? (
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground">
                            Suggested questions
                          </div>
                          <ul className="mt-2 list-disc pl-5 text-sm text-foreground space-y-1">
                            {selectedStep.suggested_questions.map((q) => (
                              <li key={q}>{q}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {selectedConcepts.length ? (
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground">
                            Concepts
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {selectedConcepts.map((concept) => (
                              <div
                                key={concept.id}
                                className="rounded-md border border-border/60 bg-card px-2 py-1 text-xs text-foreground"
                                title={concept.summary ?? undefined}
                              >
                                {concept.title?.trim()
                                  ? concept.title
                                  : concept.id}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {selectedStep.code_refs?.length ? (
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground">
                            Code references
                          </div>
                          <div className="mt-2 space-y-2">
                            {selectedStep.code_refs.map((ref) => (
                              <div
                                key={ref.id}
                                className="rounded-md border border-border/60 bg-card px-3 py-2"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-sm text-foreground">
                                      {ref.label?.trim() ? ref.label : ref.id}
                                    </div>
                                    <div className="mt-1 font-mono text-xs text-muted-foreground truncate">
                                      {ref.file_path}
                                      {formatLineRange(ref)
                                        ? ` · ${formatLineRange(ref)}`
                                        : null}
                                      {ref.symbol?.trim() ? ` · ${ref.symbol}` : null}
                                    </div>
                                    {ref.notes?.trim() ? (
                                      <div className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">
                                        {ref.notes}
                                      </div>
                                    ) : null}
                                  </div>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => {
                                      openReview(
                                        ref.file_path,
                                        ref.line_range ?? undefined
                                      );
                                      onClose();
                                    }}
                                  >
                                    Open
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-md border border-border/60 bg-card p-3 text-sm text-muted-foreground">
                          No code references provided for this step.
                        </div>
                      )}

                      {selectedStep.also_step_ids?.length ? (
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground">
                            Connections
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {selectedStep.also_step_ids.map((id) => {
                              const step = stepsById.get(id);
                              return (
                                <button
                                  key={id}
                                  type="button"
                                  className="rounded-md border border-border/60 bg-card px-2 py-1 text-xs text-foreground hover:bg-accent/40"
                                  onClick={() => onSelectStepId(id)}
                                  title={step?.title ?? undefined}
                                >
                                  {id}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="rounded-md border border-border/60 bg-card p-4 text-sm text-muted-foreground">
                      Select a step to see details.
                    </div>
                  )}
                </div>
              </>
            )}
      </div>
    </div>
  );
}
