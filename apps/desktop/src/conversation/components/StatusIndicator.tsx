import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_STATUS_HEADER } from '~/conversation/store/constants';
import { formatElapsedCompact } from '~/lib/time';

import {
  useConversationActiveTurn,
  useConversationIsRunning,
} from '../store/hooks';

export type StatusIndicatorProps = {
  conversationId?: string | null;
  running?: boolean;
  startedAt?: string | null;
  header?: string | null;
  onInterrupt?: () => void;
  interruptControlId?: string;
};

const parseTimestamp = (value?: string | null): number | null => {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const useElapsedSeconds = ({
  running,
  startedAt,
}: {
  running: boolean;
  startedAt?: string | null;
}) => {
  const startTimestamp = useMemo(() => parseTimestamp(startedAt), [startedAt]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running || startTimestamp === null) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [running, startTimestamp]);

  if (!running || startTimestamp === null) {
    return 0;
  }

  const diff = Math.floor((now - startTimestamp) / 1000);
  return diff > 0 ? diff : 0;
};

export function StatusIndicator({
  conversationId,
  running: runningProp = false,
  startedAt: startedAtProp,
  header: headerProp,
  onInterrupt,
  interruptControlId,
}: StatusIndicatorProps) {
  const conversationState = useConversationActiveTurn(conversationId ?? null);
  const conversationIsRunning = useConversationIsRunning(
    conversationId ?? null
  );
  const isConversationBound = conversationId !== undefined;
  const running = isConversationBound
    ? conversationIsRunning
    : runningProp;
  const startedAt = isConversationBound
    ? conversationState.activeTurnStartedAt
    : startedAtProp;
  const header = isConversationBound
    ? conversationState.statusHeader
    : headerProp;
  const elapsedSeconds = useElapsedSeconds({ running, startedAt });

  const formattedElapsed = useMemo(
    () => formatElapsedCompact(elapsedSeconds),
    [elapsedSeconds]
  );

  const headerLabel = useMemo(
    () => header?.trim() || DEFAULT_STATUS_HEADER,
    [header]
  );

  if (!running) {
    return null;
  }

  return (
    <div
      className="rounded-lg border border-border/70 bg-background/95 px-3 py-2 shadow-lg"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className="size-4 border-2 border-muted-foreground/40 border-t-muted-foreground/80 rounded-full animate-spin"
            aria-hidden
          />
          <div className="flex flex-row gap-4 items-baseline">
            <span
              className="text-sm font-medium leading-tight text-transparent"
              style={{
                backgroundImage: `linear-gradient(90deg, var(--status-indicator-shimmer-edge), var(--color-foreground), var(--status-indicator-shimmer-edge))`,
                backgroundSize: '200% 100%',
                backgroundPosition: '0% 50%',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                animation: 'status-indicator-shimmer 2.4s linear infinite',
              }}
            >
              {headerLabel}
            </span>
            <span className="text-xs font-mono text-muted-foreground">
              {formattedElapsed}
            </span>
          </div>
        </div>

        <button
          type="button"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onInterrupt?.();
          }}
          aria-controls={interruptControlId}
        >
          <kbd className="rounded bg-muted px-1.5 py-0.5 text-transcript-micro font-medium uppercase tracking-widest text-muted-foreground/70">
            Esc
          </kbd>
          to interrupt
        </button>
      </div>
    </div>
  );
}
