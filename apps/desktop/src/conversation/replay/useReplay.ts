import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useWorkspaceConversationStores } from '~/workspace';

import {
  DEFAULT_REPLAY_TIMING,
  REALISTIC_TIMING,
  type ReplayTimingConfig,
  STRESS_TEST_TIMING,
} from './config';
import { type ReplayControl, replayFromClipboard } from './service';

export type ReplayMode = 'default' | 'stress' | 'realistic';

export type UseReplayOptions = {
  conversationId?: string;
  mode?: ReplayMode;
};

export type UseReplayReturn = {
  isReplaying: boolean;
  startReplay: () => Promise<void>;
  stopReplay: () => void;
  mode: ReplayMode;
  setMode: (mode: ReplayMode) => void;
};

const TIMING_CONFIGS: Record<ReplayMode, ReplayTimingConfig> = {
  default: DEFAULT_REPLAY_TIMING,
  stress: STRESS_TEST_TIMING,
  realistic: REALISTIC_TIMING,
};

export function useReplay(options: UseReplayOptions = {}): UseReplayReturn {
  const { conversationId: providedConversationId } = options;
  const { applyConversationEvent } = useWorkspaceConversationStores();
  const [isReplaying, setIsReplaying] = useState(false);
  const [mode, setMode] = useState<ReplayMode>('default');
  const controlRef = useRef<ReplayControl | null>(null);

  const startReplay = useCallback(async () => {
    if (isReplaying) {
      toast.info('Replay already in progress');
      return;
    }

    try {
      setIsReplaying(true);

      const timing = TIMING_CONFIGS[mode];
      const conversationId = providedConversationId ?? `replay-${Date.now()}`;

      toast.info('Starting replay', {
        description: `Mode: ${mode}, Conversation: ${conversationId}`,
      });

      const control = await replayFromClipboard({
        conversationId,
        timing,
        onEvent: (payload) => {
          applyConversationEvent(payload);
        },
        onComplete: () => {
          setIsReplaying(false);
          controlRef.current = null;
          toast.success('Replay complete', {
            description: `Finished replaying events in ${mode} mode`,
          });
        },
        onError: (error) => {
          setIsReplaying(false);
          controlRef.current = null;
          toast.error('Replay failed', {
            description: error.message,
          });
        },
      });

      controlRef.current = control;
    } catch (error) {
      setIsReplaying(false);
      const message = error instanceof Error ? error.message : String(error);
      toast.error('Failed to start replay', {
        description: message,
      });
    }
  }, [isReplaying, mode, providedConversationId, applyConversationEvent]);

  const stopReplay = useCallback(() => {
    if (controlRef.current) {
      controlRef.current.stop();
      controlRef.current = null;
      setIsReplaying(false);
      toast.info('Replay stopped');
    }
  }, []);

  return {
    isReplaying,
    startReplay,
    stopReplay,
    mode,
    setMode,
  };
}
