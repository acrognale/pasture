import type {
  ReviewMapConcept,
  ReviewMapEdge,
  ReviewMapFile,
  ReviewMapNodeRef,
  ReviewMapOutputEvent,
  ReviewMapReviewStep,
} from '@pasture/protocol';
import { useMemo, useState } from 'react';
import { cn } from '@pasture/theme';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogHeader } from '~/components/ui/dialog';
import { dispatchOpenReviewOverlayEvent } from '~/conversation/events';
import { ReviewMapGraph } from './ReviewMapGraph';

type ReviewMapOverlayProps = {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  status: 'idle' | 'running' | 'complete';
  output: ReviewMapOutputEvent | null;
};

type NodeKey = string;

function toNodeKey(node: ReviewMapNodeRef): NodeKey {
  return `${node.kind}:${node.id}`;
}

function nodeTitle(
  node: ReviewMapNodeRef,
  conceptsById: Map<string, ReviewMapConcept>,
  filesById: Map<string, ReviewMapFile>
): string {
  if (node.kind === 'concept') {
    return conceptsById.get(node.id)?.title ?? node.id;
  }
  if (node.kind === 'file') {
    const file = filesById.get(node.id);
    return file?.path ?? node.id;
  }
  return node.id;
}

function fileIdForMap(files: readonly ReviewMapFile[]): Map<string, ReviewMapFile> {
  const map = new Map<string, ReviewMapFile>();
  files.forEach((file) => {
    map.set(file.path, file);
  });
  return map;
}

function formatEdgeType(value: ReviewMapEdge['type']): string {
  // ts-rs exports edge type as snake_case strings.
  return value.replaceAll('_', ' ');
}

function formatChangeType(value: ReviewMapFile['change_type']): string | null {
  if (!value) return null;
  return value.replaceAll('_', ' ');
}

export function ReviewMapOverlay({
  open,
  onClose,
  conversationId,
  status,
  output,
}: ReviewMapOverlayProps) {
  const [showDetails, setShowDetails] = useState(true);
  const conceptsById = useMemo(() => {
    const map = new Map<string, ReviewMapConcept>();
    (output?.concepts ?? []).forEach((concept) => {
      map.set(concept.id, concept);
    });
    return map;
  }, [output]);

  const filesById = useMemo(
    () => fileIdForMap(output?.files ?? []),
    [output]
  );

  const [selectedNodeKey, setSelectedNodeKey] = useState<NodeKey | null>(null);

  const selectedNode = useMemo<ReviewMapNodeRef | null>(() => {
    if (!output) return null;
    const steps = output.review_order ?? [];
    const initial = steps[0]?.node ?? null;
    if (!selectedNodeKey) return initial;
    const match =
      steps.find((step) => toNodeKey(step.node) === selectedNodeKey)?.node ??
      null;
    return match ?? initial;
  }, [output, selectedNodeKey]);

  const selectedStep = useMemo<ReviewMapReviewStep | null>(() => {
    if (!output || !selectedNode) return null;
    return (
      output.review_order.find(
        (step) => toNodeKey(step.node) === toNodeKey(selectedNode)
      ) ?? null
    );
  }, [output, selectedNode]);

  const selectedEdges = useMemo(() => {
    if (!output || !selectedNode) return [];
    const key = toNodeKey(selectedNode);
    return output.edges.filter((edge) => {
      return toNodeKey(edge.from) === key || toNodeKey(edge.to) === key;
    });
  }, [output, selectedNode]);

  const selectedConcept =
    selectedNode?.kind === 'concept'
      ? conceptsById.get(selectedNode.id) ?? null
      : null;

  const selectedFile =
    selectedNode?.kind === 'file' ? filesById.get(selectedNode.id) ?? null : null;

  const outgoingEdges = useMemo(() => {
    if (!output || !selectedNode) return [];
    const key = toNodeKey(selectedNode);
    return output.edges.filter((edge) => toNodeKey(edge.from) === key);
  }, [output, selectedNode]);

  const incomingEdges = useMemo(() => {
    if (!output || !selectedNode) return [];
    const key = toNodeKey(selectedNode);
    return output.edges.filter((edge) => toNodeKey(edge.to) === key);
  }, [output, selectedNode]);

  const nodeTitleForGraph = useMemo(
    () => (node: ReviewMapNodeRef) => nodeTitle(node, conceptsById, filesById),
    [conceptsById, filesById]
  );

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="max-w-none sm:max-w-none h-[94vh] w-[99vw] p-0">
        <div className="flex h-full flex-col bg-background">
          <DialogHeader className="border-b border-border/60 px-6 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-base font-semibold text-foreground truncate">
                  {output?.title?.trim()
                    ? output.title
                    : status === 'running'
                      ? 'Generating review map…'
                      : 'Review map'}
                </div>
                {output?.summary?.trim() ? (
                  <div className="mt-1 text-sm text-muted-foreground line-clamp-2">
                    {output.summary}
                  </div>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowDetails((v) => !v)}
                >
                  {showDetails ? 'Hide details' : 'Show details'}
                </Button>
                <Button variant="ghost" onClick={onClose}>
                  Close
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
            <div
              className={cn(
                'min-w-0 flex-1',
                showDetails ? 'border-b border-border/60 xl:border-b-0 xl:border-r' : null
              )}
            >
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
                <ReviewMapGraph
                  output={output}
                  selectedNodeKey={selectedNodeKey}
                  onSelectNodeKey={setSelectedNodeKey}
                  nodeTitle={nodeTitleForGraph}
                />
              )}
            </div>

            {showDetails ? (
              <div className="shrink-0 bg-card p-6 overflow-auto xl:w-[460px]">
                {!output ? null : (
                  <>
                    <div className="text-sm font-semibold text-foreground">
                      {selectedNode
                        ? nodeTitle(selectedNode, conceptsById, filesById)
                        : 'Details'}
                    </div>

                    {selectedStep?.why?.trim() ? (
                      <div className="mt-3">
                        <div className="text-xs font-semibold text-muted-foreground">
                          Intent
                        </div>
                        <div className="mt-2 text-sm text-foreground whitespace-pre-wrap">
                          {selectedStep.why}
                        </div>
                      </div>
                    ) : null}

                    {selectedStep?.suggested_questions?.length ? (
                      <div className="mt-4">
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

                    {selectedConcept ? (
                      <div className="mt-4 space-y-4">
                        {selectedConcept.summary?.trim() ? (
                          <div className="text-sm text-foreground whitespace-pre-wrap">
                            {selectedConcept.summary}
                          </div>
                        ) : null}

                        {selectedConcept.primary_files?.length ? (
                          <div>
                            <div className="text-xs font-semibold text-muted-foreground">
                              Primary files
                            </div>
                            <div className="mt-2 space-y-2">
                              {selectedConcept.primary_files.map((path) => (
                                <div
                                  key={path}
                                  className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-3 py-2"
                                >
                                  <div className="min-w-0 font-mono text-xs text-foreground truncate">
                                    {path}
                                  </div>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => {
                                      dispatchOpenReviewOverlayEvent(
                                        conversationId,
                                        path
                                      );
                                      onClose();
                                    }}
                                  >
                                    Open
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {selectedConcept.risks?.length ? (
                          <div>
                            <div className="text-xs font-semibold text-muted-foreground">
                              Risks
                            </div>
                            <ul className="mt-2 list-disc pl-5 text-sm text-foreground space-y-1">
                              {selectedConcept.risks.map((risk) => (
                                <li key={risk}>{risk}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        {selectedConcept.questions?.length ? (
                          <div>
                            <div className="text-xs font-semibold text-muted-foreground">
                              Open questions
                            </div>
                            <ul className="mt-2 list-disc pl-5 text-sm text-foreground space-y-1">
                              {selectedConcept.questions.map((q) => (
                                <li key={q}>{q}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {selectedFile ? (
                      <div className="mt-4 space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-muted-foreground">
                              File
                            </div>
                            <div className="mt-1 font-mono text-xs text-foreground truncate">
                              {selectedFile.path}
                            </div>
                            {formatChangeType(selectedFile.change_type) ? (
                              <div className="mt-1 text-xs text-muted-foreground">
                                {formatChangeType(selectedFile.change_type)}
                              </div>
                            ) : null}
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              dispatchOpenReviewOverlayEvent(
                                conversationId,
                                selectedFile.path
                              );
                              onClose();
                            }}
                          >
                            Open
                          </Button>
                        </div>

                        {selectedFile.summary?.trim() ? (
                          <div className="text-sm text-foreground whitespace-pre-wrap">
                            {selectedFile.summary}
                          </div>
                        ) : null}

                        {selectedFile.concepts?.length ? (
                          <div>
                            <div className="text-xs font-semibold text-muted-foreground">
                              Related concepts
                            </div>
                            <ul className="mt-2 space-y-1 text-sm text-foreground">
                              {selectedFile.concepts.map((id) => (
                                <li key={id}>
                                  {conceptsById.get(id)?.title ?? id}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        <div>
                          <div className="text-xs font-semibold text-muted-foreground">
                            Diff snippets
                          </div>
                          <div className="mt-2 rounded-md border border-border/60 bg-background p-3 text-sm text-muted-foreground">
                            This review map output does not include diff hunks yet. Use
                            the “Open” button above to jump into the review panel for
                            file-level diffs.
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {(incomingEdges.length || outgoingEdges.length) && selectedNode ? (
                      <div className="mt-6 space-y-4">
                        {incomingEdges.length ? (
                          <div>
                            <div className="text-xs font-semibold text-muted-foreground">
                              Upstream dependencies
                            </div>
                            <div className="mt-2 space-y-2">
                              {incomingEdges.map((edge, index) => (
                                <div
                                  key={`in:${toNodeKey(edge.from)}->${toNodeKey(edge.to)}:${index}`}
                                  className="rounded-md border border-border/60 bg-background px-3 py-2"
                                >
                                  <div className="text-sm text-foreground">
                                    <button
                                      type="button"
                                      className="font-medium hover:underline"
                                      onClick={() =>
                                        setSelectedNodeKey(toNodeKey(edge.from))
                                      }
                                    >
                                      {nodeTitle(edge.from, conceptsById, filesById)}
                                    </button>{' '}
                                    <span className="text-muted-foreground">
                                      {formatEdgeType(edge.type)}
                                    </span>{' '}
                                    <span className="font-medium">
                                      {nodeTitle(edge.to, conceptsById, filesById)}
                                    </span>
                                  </div>
                                  {edge.rationale?.trim() ? (
                                    <div className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
                                      {edge.rationale}
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {outgoingEdges.length ? (
                          <div>
                            <div className="text-xs font-semibold text-muted-foreground">
                              Downstream impacts
                            </div>
                            <div className="mt-2 space-y-2">
                              {outgoingEdges.map((edge, index) => (
                                <div
                                  key={`out:${toNodeKey(edge.from)}->${toNodeKey(edge.to)}:${index}`}
                                  className="rounded-md border border-border/60 bg-background px-3 py-2"
                                >
                                  <div className="text-sm text-foreground">
                                    <span className="font-medium">
                                      {nodeTitle(edge.from, conceptsById, filesById)}
                                    </span>{' '}
                                    <span className="text-muted-foreground">
                                      {formatEdgeType(edge.type)}
                                    </span>{' '}
                                    <button
                                      type="button"
                                      className="font-medium hover:underline"
                                      onClick={() =>
                                        setSelectedNodeKey(toNodeKey(edge.to))
                                      }
                                    >
                                      {nodeTitle(edge.to, conceptsById, filesById)}
                                    </button>
                                  </div>
                                  {edge.rationale?.trim() ? (
                                    <div className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
                                      {edge.rationale}
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {selectedEdges.length ? (
                      <div className="mt-6">
                        <div className="text-xs font-semibold text-muted-foreground">
                          Relationships
                        </div>
                        <div className="mt-2 space-y-2">
                          {selectedEdges.map((edge, index) => {
                            const from = nodeTitle(edge.from, conceptsById, filesById);
                            const to = nodeTitle(edge.to, conceptsById, filesById);
                            return (
                              <div
                                key={`${toNodeKey(edge.from)}->${toNodeKey(edge.to)}:${index}`}
                                className="rounded-md border border-border/60 bg-background p-3"
                              >
                                <div className="text-sm text-foreground">
                                  <span className="font-medium">{from}</span>{' '}
                                  <span className="text-muted-foreground">
                                    {formatEdgeType(edge.type)}
                                  </span>{' '}
                                  <span className="font-medium">{to}</span>
                                </div>
                                {edge.rationale?.trim() ? (
                                  <div className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
                                    {edge.rationale}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-8">
                      <div className="text-xs font-semibold text-muted-foreground">
                        Review order
                      </div>
                      <div className="mt-2 space-y-1">
                        {(output.review_order ?? []).map((step, index) => {
                          const key = toNodeKey(step.node);
                          const isActive = selectedNodeKey
                            ? key === selectedNodeKey
                            : index === 0;
                          return (
                            <button
                              key={key}
                              type="button"
                              className={cn(
                                'w-full rounded-md px-3 py-2 text-left text-sm transition',
                                isActive
                                  ? 'bg-accent/60 text-foreground'
                                  : 'hover:bg-accent/40 text-foreground'
                              )}
                              onClick={() => setSelectedNodeKey(key)}
                            >
                              <div className="flex items-start gap-2">
                                <div className="mt-[1px] text-xs text-muted-foreground tabular-nums">
                                  {index + 1}
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate">
                                    {nodeTitle(step.node, conceptsById, filesById)}
                                  </div>
                                  {step.why?.trim() ? (
                                    <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                                      {step.why}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
