import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_STATUS_HEADER } from '~/conversation/store/constants';
import { formatElapsedCompact } from '~/lib/time';

import {
  useConversationActiveTurn,
  useConversationIsRunning,
  useConversationQueueActions,
  useConversationQueuedMessages,
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
  const queuedMessages = useConversationQueuedMessages(conversationId ?? null);
  const { clearQueuedUserMessages } = useConversationQueueActions(
    conversationId ?? null
  );
  const isConversationBound = conversationId !== undefined;

  const running =
    runningProp || (isConversationBound ? conversationIsRunning : runningProp);

  const startedAt = runningProp
    ? startedAtProp
    : isConversationBound
      ? conversationState.activeTurnStartedAt
      : startedAtProp;

  const header = runningProp
    ? headerProp
    : isConversationBound
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
      {queuedMessages.length > 0 ? (
        <div className="mt-2 space-y-1 text-transcript-base text-muted-foreground">
          <div className="flex items-center justify-between text-transcript-micro">
            <span className="text-muted-foreground">Queued messages</span>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded border border-border/70 px-2 py-0.5 text-transcript-micro font-medium text-error-foreground hover:bg-muted transition-colors"
              onClick={() => {
                clearQueuedUserMessages();
              }}
            >
              Cancel queued
            </button>
          </div>
          {queuedMessages.map((message, index) => {
            const attachmentCount = message.attachments?.length ?? 0;
            const trimmed = message.text.trim();
            const titleParts = [];
            if (trimmed) {
              titleParts.push(trimmed);
            }
            if (attachmentCount > 0) {
              titleParts.push(
                `${attachmentCount} image${attachmentCount === 1 ? '' : 's'}`
              );
            }
            const title =
              titleParts.length > 0 ? titleParts.join(' • ') : undefined;
            const label =
              trimmed || (attachmentCount > 0 ? 'Image message' : '');
            return (
              <div
                key={`queued-${index}`}
                className="flex items-center justify-between gap-2 rounded-md bg-muted/60 px-2 py-1"
                title={title}
              >
                <span className="truncate">{label}</span>
                {attachmentCount > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {attachmentCount} image{attachmentCount === 1 ? '' : 's'}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
