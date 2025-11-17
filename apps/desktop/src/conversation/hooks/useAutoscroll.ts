import {
  RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type UseAutoscrollOptions = {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  bottomAnchorRef: RefObject<HTMLDivElement | null>;
  transcriptContentRef: RefObject<HTMLDivElement | null>;
  isLoading: boolean;
  hasTranscript: boolean;
  lastVisibleCellEventKey: string;
  turnCounter: number;
  deferredCellsLength: number;
  onAtBottomChange?: (atBottom: boolean) => void;
  resetKey?: string | number | null;
};

type UseAutoscrollResult = {
  scrollToBottom: () => void;
  scrollToBottomAndMark: () => void;
  isPinnedToBottom: boolean;
};

const BOTTOM_THRESHOLD_PX = 48;

export const useAutoscroll = ({
  scrollContainerRef,
  bottomAnchorRef,
  transcriptContentRef,
  isLoading,
  hasTranscript,
  lastVisibleCellEventKey,
  turnCounter,
  deferredCellsLength,
  onAtBottomChange,
  resetKey,
}: UseAutoscrollOptions): UseAutoscrollResult => {
  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true);
  const shouldAutoScrollRef = useRef(true);
  const isProgrammaticScrollRef = useRef(false);

  const setPinnedState = useCallback((next: boolean) => {
    if (shouldAutoScrollRef.current === next) {
      return;
    }
    shouldAutoScrollRef.current = next;
    setIsPinnedToBottom(next);
  }, []);

  useEffect(() => {
    onAtBottomChange?.(isPinnedToBottom);
  }, [isPinnedToBottom, onAtBottomChange]);

  useEffect(() => {
    if (!hasTranscript) {
      setPinnedState(true);
    }
  }, [hasTranscript, setPinnedState]);

  useEffect(() => {
    if (resetKey == null) {
      return;
    }
    setPinnedState(true);
  }, [resetKey, setPinnedState]);

  const runProgrammaticScroll = useCallback((fn: () => void) => {
    isProgrammaticScrollRef.current = true;
    try {
      fn();
    } finally {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => {
          isProgrammaticScrollRef.current = false;
        });
      } else {
        isProgrammaticScrollRef.current = false;
      }
    }
  }, []);

  const performScroll = useCallback(
    (behavior: ScrollBehavior = 'auto') => {
      runProgrammaticScroll(() => {
        const container = scrollContainerRef.current;
        if (!container) {
          return;
        }

        const anchor = bottomAnchorRef.current;
        if (anchor?.scrollIntoView) {
          try {
            anchor.scrollIntoView({
              block: 'end',
              inline: 'nearest',
              behavior,
            });
          } catch {
            // Fallback to manual scrolling if scrollIntoView fails.
          }
        }

        if (behavior === 'smooth' && typeof container.scrollTo === 'function') {
          container.scrollTo({
            top: container.scrollHeight,
            behavior,
          });
        } else {
          container.scrollTop = container.scrollHeight;
        }
      });
    },
    [bottomAnchorRef, runProgrammaticScroll, scrollContainerRef]
  );

  const scrollToBottom = useCallback(() => {
    performScroll('auto');
  }, [performScroll]);

  const scrollToBottomAndMark = useCallback(() => {
    setPinnedState(true);
    performScroll('smooth');
  }, [performScroll, setPinnedState]);

  const autoScrollIfNeeded = useCallback(() => {
    if (!shouldAutoScrollRef.current) {
      return;
    }
    performScroll('auto');
  }, [performScroll]);

  const isAtBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return true;
    }
    const remaining =
      container.scrollHeight - (container.scrollTop + container.clientHeight);
    return remaining <= BOTTOM_THRESHOLD_PX;
  }, [scrollContainerRef]);

  useEffect(() => {
    const node = scrollContainerRef.current;
    if (!node) {
      return;
    }

    const handleScroll = () => {
      if (isProgrammaticScrollRef.current) {
        return;
      }
      setPinnedState(isAtBottom());
    };

    node.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      node.removeEventListener('scroll', handleScroll);
    };
  }, [isAtBottom, scrollContainerRef, setPinnedState]);

  useEffect(() => {
    if (isLoading || !hasTranscript) {
      return;
    }

    const raf = requestAnimationFrame(() => {
      autoScrollIfNeeded();
    });

    return () => {
      cancelAnimationFrame(raf);
    };
  }, [
    autoScrollIfNeeded,
    hasTranscript,
    isLoading,
    lastVisibleCellEventKey,
    turnCounter,
    deferredCellsLength,
    resetKey,
  ]);

  const resizeObserver = useMemo(() => {
    if (typeof ResizeObserver === 'undefined') {
      return null;
    }

    return new ResizeObserver(() => {
      if (!shouldAutoScrollRef.current) {
        return;
      }
      autoScrollIfNeeded();
    });
  }, [autoScrollIfNeeded]);

  useEffect(() => {
    if (!resizeObserver) {
      return;
    }
    const contentNode = transcriptContentRef.current;
    if (!contentNode) {
      return;
    }
    resizeObserver.observe(contentNode);
    return () => {
      resizeObserver.disconnect();
    };
  }, [hasTranscript, resetKey, resizeObserver, transcriptContentRef]);

  return {
    scrollToBottom,
    scrollToBottomAndMark,
    isPinnedToBottom,
  };
};
