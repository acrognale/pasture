import type { ReviewMapNodeRef, ReviewMapOutputEvent } from '@pasture/protocol';
import type { PointerEventHandler, WheelEventHandler } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type NodeKey = string;

type ReviewMapGraphProps = {
  output: ReviewMapOutputEvent;
  selectedNodeKey: NodeKey | null;
  onSelectNodeKey: (key: NodeKey) => void;
  nodeTitle: (node: ReviewMapNodeRef) => string;
};

type PositionedNode = {
  key: NodeKey;
  node: ReviewMapNodeRef;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type ViewTransform = {
  x: number;
  y: number;
  scale: number;
};

function toNodeKey(node: ReviewMapNodeRef): NodeKey {
  return `${node.kind}:${node.id}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function truncateLabel(value: string, maxChars: number) {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function computeNodes(output: ReviewMapOutputEvent, nodeTitle: (n: ReviewMapNodeRef) => string) {
  const orderIndexByKey = new Map<NodeKey, number>();
  output.review_order.forEach((step, index) => {
    orderIndexByKey.set(toNodeKey(step.node), index);
  });

  const nodesInOrder: ReviewMapNodeRef[] = output.review_order.map((s) => s.node);
  const referenced = new Map<NodeKey, ReviewMapNodeRef>();
  nodesInOrder.forEach((n) => referenced.set(toNodeKey(n), n));
  output.edges.forEach((e) => {
    referenced.set(toNodeKey(e.from), e.from);
    referenced.set(toNodeKey(e.to), e.to);
  });

  output.concepts.forEach((c) => {
    referenced.set(toNodeKey({ kind: 'concept', id: c.id }), { kind: 'concept', id: c.id });
  });
  output.files.forEach((f) => {
    referenced.set(toNodeKey({ kind: 'file', id: f.path }), { kind: 'file', id: f.path });
  });

  const maxOrder = output.review_order.length;
  const all = [...referenced.values()].map((node) => {
    const key = toNodeKey(node);
    const orderIndex = orderIndexByKey.get(key) ?? maxOrder + 1000;
    return { node, key, orderIndex };
  });

  all.sort((a, b) => a.orderIndex - b.orderIndex || a.key.localeCompare(b.key));

  const columnGap = 140;
  const conceptX = 40;
  const fileX = conceptX + 360 + columnGap;
  const yStart = 40;
  const yStep = 110;

  const positioned: PositionedNode[] = all.map((entry, rowIndex) => {
    const isConcept = entry.node.kind === 'concept';
    const width = isConcept ? 360 : 300;
    const height = isConcept ? 74 : 56;
    const x = isConcept ? conceptX : fileX;
    const y = yStart + rowIndex * yStep;
    const title = nodeTitle(entry.node);
    return {
      key: entry.key,
      node: entry.node,
      title,
      x,
      y,
      width,
      height,
    };
  });

  return positioned;
}

function computeBounds(nodes: readonly PositionedNode[]) {
  if (!nodes.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  nodes.forEach((n) => {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  });
  return { minX, minY, maxX, maxY };
}

function edgePath(from: PositionedNode, to: PositionedNode) {
  const fromX = from.x + from.width;
  const fromY = from.y + from.height / 2;
  const toX = to.x;
  const toY = to.y + to.height / 2;

  const dx = Math.max(80, Math.abs(toX - fromX) * 0.5);
  const c1x = fromX + dx;
  const c1y = fromY;
  const c2x = toX - dx;
  const c2y = toY;
  return `M ${fromX} ${fromY} C ${c1x} ${c1y} ${c2x} ${c2y} ${toX} ${toY}`;
}

export function ReviewMapGraph({
  output,
  selectedNodeKey,
  onSelectNodeKey,
  nodeTitle,
}: ReviewMapGraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const nodes = useMemo(() => computeNodes(output, nodeTitle), [nodeTitle, output]);
  const nodesByKey = useMemo(() => {
    const map = new Map<NodeKey, PositionedNode>();
    nodes.forEach((n) => map.set(n.key, n));
    return map;
  }, [nodes]);
  const bounds = useMemo(() => computeBounds(nodes), [nodes]);

  const [transform, setTransform] = useState<ViewTransform>({ x: 0, y: 0, scale: 1 });
  const panRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const fitToView = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const width = el.clientWidth;
    const height = el.clientHeight;
    if (!width || !height) return;

    const pad = 60;
    const worldWidth = Math.max(1, bounds.maxX - bounds.minX + pad * 2);
    const worldHeight = Math.max(1, bounds.maxY - bounds.minY + pad * 2);

    const scale = clamp(Math.min(width / worldWidth, height / worldHeight), 0.2, 2.5);
    const x = width / 2 - (bounds.minX + (bounds.maxX - bounds.minX) / 2) * scale;
    const y = height / 2 - (bounds.minY + (bounds.maxY - bounds.minY) / 2) * scale;
    setTransform({ x, y, scale });
  }, [bounds.maxX, bounds.maxY, bounds.minX, bounds.minY]);

  const resetView = () => setTransform({ x: 0, y: 0, scale: 1 });

  useEffect(() => {
    // Default to a readable framing when the overlay opens.
    fitToView();
  }, [fitToView, nodes.length]);

  const onWheel: WheelEventHandler<SVGSVGElement> = (event) => {
    event.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;

    const worldX = (px - transform.x) / transform.scale;
    const worldY = (py - transform.y) / transform.scale;
    const nextScale = clamp(transform.scale * Math.exp(-event.deltaY * 0.001), 0.2, 2.5);
    const nextX = px - worldX * nextScale;
    const nextY = py - worldY * nextScale;
    setTransform({ x: nextX, y: nextY, scale: nextScale });
  };

  const onPointerDown: PointerEventHandler<SVGSVGElement> = (event) => {
    const target = event.target as Element | null;
    if (target?.closest?.('[data-review-map-node]')) {
      return;
    }
    const svg = svgRef.current;
    if (!svg) return;
    svg.setPointerCapture(event.pointerId);
    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: transform.x,
      originY: transform.y,
    };
  };

  const onPointerMove: PointerEventHandler<SVGSVGElement> = (event) => {
    const active = panRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const dx = event.clientX - active.startX;
    const dy = event.clientY - active.startY;
    setTransform((prev) => ({ ...prev, x: active.originX + dx, y: active.originY + dy }));
  };

  const onPointerUp: PointerEventHandler<SVGSVGElement> = (event) => {
    const active = panRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    panRef.current = null;
  };

  const selectedKey =
    selectedNodeKey ?? (output.review_order[0]?.node ? toNodeKey(output.review_order[0].node) : null);

  const edgeStrokeClass = 'text-muted-foreground';
  const nodeStrokeClass = 'text-muted-foreground';

  const edges = output.edges.filter((e) => nodesByKey.has(toNodeKey(e.from)) && nodesByKey.has(toNodeKey(e.to)));

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-background">
      <div className="absolute left-3 top-3 z-10 flex items-center gap-2">
        <button
          type="button"
          className="rounded-md border border-border/60 bg-card px-2 py-1 text-xs text-foreground hover:bg-accent/40"
          onClick={fitToView}
        >
          Fit
        </button>
        <button
          type="button"
          className="rounded-md border border-border/60 bg-card px-2 py-1 text-xs text-foreground hover:bg-accent/40"
          onClick={resetView}
        >
          Reset
        </button>
        <div className="ml-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm border border-border/60 bg-popover" />
            Concept
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm border border-border/60 bg-card" />
            File
          </span>
        </div>
      </div>

      <svg
        ref={svgRef}
        className="h-full w-full touch-none"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        role="img"
        aria-label="Review map graph"
      >
        <defs>
          <marker
            id="review-map-arrow"
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="5"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>

        <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.scale})`}>
          <g className={edgeStrokeClass} style={{ color: '#737373' }}>
            {edges.map((edge, index) => {
              const from = nodesByKey.get(toNodeKey(edge.from))!;
              const to = nodesByKey.get(toNodeKey(edge.to))!;
              const isSelected =
                selectedKey &&
                (toNodeKey(edge.from) === selectedKey || toNodeKey(edge.to) === selectedKey);

              return (
                <path
                  key={`${toNodeKey(edge.from)}->${toNodeKey(edge.to)}:${index}`}
                  d={edgePath(from, to)}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  opacity={isSelected ? 0.95 : 0.5}
                  markerEnd="url(#review-map-arrow)"
                />
              );
            })}
          </g>

          <g className={nodeStrokeClass} style={{ color: '#404040' }}>
            {nodes.map((n) => {
              const isSelected = selectedKey === n.key;
              const isConcept = n.node.kind === 'concept';
              const fill = isConcept ? '#262626' : '#1c1c1c';
              const stroke = isSelected ? '#e5e5e5' : '#404040';
              const title = truncateLabel(n.title, isConcept ? 44 : 48);
              const subtitle = isConcept ? 'Concept' : 'File';

              return (
                <g
                  key={n.key}
                  data-review-map-node
                  transform={`translate(${n.x} ${n.y})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectNodeKey(n.key);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x={0}
                    y={0}
                    width={n.width}
                    height={n.height}
                    rx={10}
                    ry={10}
                    style={{
                      fill,
                      stroke,
                      strokeWidth: isSelected ? 2.5 : 1.5,
                    }}
                  />
                  <text x={14} y={24} style={{ fill: '#e5e5e5', fontSize: 13, fontWeight: 600 }}>
                    {title}
                  </text>
                  <text x={14} y={44} style={{ fill: '#a3a3a3', fontSize: 11 }}>
                    {subtitle}
                  </text>
                </g>
              );
            })}
          </g>
        </g>
      </svg>
    </div>
  );
}
