import type { ReactNode } from 'react';
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type RenderRow<Row> = (row: Row, rowIndex: number) => ReactNode;
type RowKeyGetter<Row> = (row: Row, rowIndex: number) => string | number;

type VirtualizedHunkProps<Row> = {
  rows: readonly Row[];
  renderRow: RenderRow<Row>;
  getRowKey: RowKeyGetter<Row>;
};

const CHUNK_LENGTH = 25;
const DEFAULT_CHUNK_HEIGHT = 18;

type ChunkSectionProps<Row> = {
  chunk: readonly Row[];
  chunkIndex: number;
  offset: number;
  isVisible: boolean;
  measuredHeight: number | undefined;
  onVisibilityChange: (chunkIndex: number, visible: boolean) => void;
  onHeightChange: (chunkIndex: number, height: number) => void;
  renderRow: RenderRow<Row>;
  getRowKey: RowKeyGetter<Row>;
};

export function VirtualizedHunk<Row>({
  rows,
  renderRow,
  getRowKey,
}: VirtualizedHunkProps<Row>) {
  const firstRow = rows.length > 0 ? rows[0] : undefined;
  const remainingRows = useMemo(
    () => (rows.length > 1 ? rows.slice(1) : []),
    [rows]
  );
  const chunkedRows = useMemo(
    () => chunkRows(remainingRows, CHUNK_LENGTH),
    [remainingRows]
  );
  const chunkCount = chunkedRows.length;

  const [chunkVisibility, setChunkVisibility] = useState<boolean[]>(() =>
    Array.from({ length: chunkCount }, () => false)
  );
  const [chunkHeights, setChunkHeights] = useState<Array<number | undefined>>(
    () => Array.from({ length: chunkCount }, () => undefined)
  );

  const handleVisibilityChange = useCallback(
    (chunkIndex: number, visible: boolean) => {
      setChunkVisibility((current) => {
        if (current[chunkIndex] === visible) {
          return current;
        }
        const next = [...current];
        next[chunkIndex] = visible;
        return next;
      });
    },
    []
  );

  const handleHeightChange = useCallback(
    (chunkIndex: number, height: number) => {
      setChunkHeights((current) => {
        if (current[chunkIndex] === height) {
          return current;
        }
        const next = [...current];
        next[chunkIndex] = height;
        return next;
      });
    },
    []
  );

  if (!firstRow && chunkedRows.length === 0) {
    return null;
  }

  return (
    <>
      {firstRow ? (
        <Fragment key={getRowKey(firstRow, 0)}>
          {renderRow(firstRow, 0)}
        </Fragment>
      ) : null}
      {chunkedRows.map((chunk, chunkIndex) => (
        <ChunkSection
          key={`chunk-${chunkIndex}`}
          chunk={chunk}
          chunkIndex={chunkIndex}
          offset={1 + chunkIndex * CHUNK_LENGTH}
          isVisible={chunkVisibility[chunkIndex] ?? false}
          measuredHeight={chunkHeights[chunkIndex]}
          onVisibilityChange={handleVisibilityChange}
          onHeightChange={handleHeightChange}
          renderRow={renderRow}
          getRowKey={getRowKey}
        />
      ))}
    </>
  );
}

function ChunkSection<Row>({
  chunk,
  chunkIndex,
  offset,
  isVisible,
  measuredHeight,
  onVisibilityChange,
  onHeightChange,
  renderRow,
  getRowKey,
}: ChunkSectionProps<Row>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) {
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      onVisibilityChange(chunkIndex, Boolean(entry?.isIntersecting));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [chunkIndex, onVisibilityChange]);

  useLayoutEffect(() => {
    if (!isVisible || !contentRef.current) {
      return;
    }
    onHeightChange(chunkIndex, contentRef.current.clientHeight);
  }, [chunk, chunkIndex, isVisible, onHeightChange]);

  useEffect(() => {
    if (!isVisible || !contentRef.current) {
      return;
    }
    const resizeObserver = new ResizeObserver(() => {
      if (contentRef.current) {
        onHeightChange(chunkIndex, contentRef.current.clientHeight);
      }
    });
    resizeObserver.observe(contentRef.current);
    return () => resizeObserver.disconnect();
  }, [chunkIndex, isVisible, onHeightChange]);

  if (!isVisible) {
    const placeholderHeight =
      measuredHeight ?? CHUNK_LENGTH * DEFAULT_CHUNK_HEIGHT;
    return (
      <div ref={containerRef} aria-hidden="true" className="flex flex-col">
        <div style={{ height: placeholderHeight }} />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col">
      <div ref={contentRef} className="flex flex-col">
        {chunk.map((row, index) => (
          <Fragment key={getRowKey(row, offset + index)}>
            {renderRow(row, offset + index)}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function chunkRows<Row>(rows: readonly Row[], size: number): Row[][] {
  if (rows.length === 0) {
    return [];
  }
  const result: Row[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    result.push(rows.slice(index, index + size));
  }
  return result;
}
