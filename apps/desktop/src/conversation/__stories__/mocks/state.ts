import { useSyncExternalStore } from 'react';
import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import type { ConversationSummary } from '~/codex.gen/ConversationSummary';
import type { ComposerTurnConfig } from '~/composer/config';
import {
  type ConversationState,
  createInitialConversationState,
} from '~/conversation/store/reducer';
import type {
  TranscriptState,
  TranscriptTurn,
  TranscriptUserMessageCell,
} from '~/conversation/transcript/types';
import { countTranscriptCells } from '~/conversation/transcript/view';

import {
  createSampleConversationState,
  sampleComposerConfig,
  sampleConversationRuntime,
  sampleConversationSummaries,
  sampleTranscript,
} from './data';

export type ConversationEntry = {
  state: ConversationState;
  eventsJsonl: string;
  eventCount: number;
};

export type MockCodexState = {
  workspacePath: string;
  normalizedWorkspacePath: string | null;
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  entries: Record<string, ConversationEntry>;
  composerConfig: ComposerTurnConfig;
  mutationPending: boolean;
  interruptPending: boolean;
};

const ensureMockTurn = (
  transcript: TranscriptState,
  turnId: string
): TranscriptTurn =>
  transcript.turns[turnId] ?? {
    id: turnId,
    cells: [],
    startedAt: null,
    completedAt: null,
    status: 'active',
  };

const createConversationEntry = (
  overrides?: Partial<ConversationEntry>
): ConversationEntry => ({
  state: createInitialConversationState(),
  eventsJsonl: '',
  eventCount: 0,
  ...overrides,
});

const createInitialState = (): MockCodexState => {
  const conversationId =
    sampleConversationSummaries[0]?.conversationId ?? 'storybook-session';
  return {
    workspacePath: '/tmp/storybook-workspace',
    normalizedWorkspacePath: '/tmp/storybook-workspace',
    conversations: sampleConversationSummaries,
    activeConversationId: conversationId,
    entries: {
      [conversationId]: createConversationEntry({
        state: createSampleConversationState(),
        eventsJsonl:
          JSON.stringify({
            type: 'user_message',
            message: 'Explore the code and summarize the plan.',
          }) + '\n',
        eventCount: countTranscriptCells(sampleTranscript),
      }),
    },
    composerConfig: sampleComposerConfig,
    mutationPending: false,
    interruptPending: false,
  };
};

export const mockCodexStore: StoreApi<MockCodexState> =
  createStore<MockCodexState>(() => createInitialState());

const snapshotListeners = new Set<() => void>();
if (typeof mockCodexStore.subscribe === 'function') {
  mockCodexStore.subscribe(() => {
    snapshotListeners.forEach((listener) => listener());
  });
}

const subscribeToSnapshots = (listener: () => void) => {
  snapshotListeners.add(listener);
  return () => {
    snapshotListeners.delete(listener);
  };
};

const resolveConversationId = (conversationId?: string | null) =>
  conversationId ?? mockCodexStore.getState().activeConversationId;

const updateEntry = (
  conversationId: string,
  updater: (entry: ConversationEntry) => ConversationEntry
) => {
  mockCodexStore.setState((current) => {
    const existing = current.entries[conversationId];
    const nextEntry = updater(
      existing ??
        createConversationEntry({ state: createInitialConversationState() })
    );
    return {
      ...current,
      entries: {
        ...current.entries,
        [conversationId]: nextEntry,
      },
    };
  });
};

export const useMockCodexStore = <T>(
  selector: (state: MockCodexState) => T
): T =>
  useSyncExternalStore(
    subscribeToSnapshots,
    () => selector(mockCodexStore.getState()),
    () => selector(mockCodexStore.getState())
  );

const setTranscriptFor = (
  conversationId: string,
  next: TranscriptState | ((current: TranscriptState) => TranscriptState)
) => {
  updateEntry(conversationId, (entry) => {
    const transcript =
      typeof next === 'function' ? next(entry.state.transcript) : next;
    return {
      ...entry,
      state: {
        ...entry.state,
        transcript,
      },
      eventCount: countTranscriptCells(transcript),
    };
  });
};

const setRuntimeFor = (
  conversationId: string,
  updates: Partial<ConversationState>
) => {
  updateEntry(conversationId, (entry) => ({
    ...entry,
    state: {
      ...entry.state,
      ...updates,
    },
  }));
};

export const mockCodexControls = {
  reset: () => {
    mockCodexStore.setState(createInitialState(), true);
  },
  setWorkspacePath: (workspacePath: string) => {
    mockCodexStore.setState((state) => ({
      ...state,
      workspacePath,
      normalizedWorkspacePath: workspacePath || null,
    }));
  },
  setActiveConversationId: (conversationId: string | null) => {
    mockCodexStore.setState((state) => ({
      ...state,
      activeConversationId: conversationId,
    }));
  },
  setConversations: (conversations: ConversationSummary[]) => {
    mockCodexStore.setState((state) => ({
      ...state,
      conversations,
    }));
  },
  setConversationState: (
    nextState: ConversationState,
    conversationId?: string | null
  ) => {
    const targetId = resolveConversationId(conversationId);
    if (!targetId) {
      return;
    }
    updateEntry(targetId, (entry) => ({
      ...entry,
      state: nextState,
      eventCount: entry.eventCount,
    }));
  },
  setTranscript: (
    next: TranscriptState | ((current: TranscriptState) => TranscriptState),
    conversationId?: string | null
  ) => {
    const targetId = resolveConversationId(conversationId);
    if (!targetId) {
      return;
    }
    setTranscriptFor(targetId, next);
  },
  setRuntime: (
    updates: Partial<ConversationState>,
    conversationId?: string | null
  ) => {
    const targetId = resolveConversationId(conversationId);
    if (!targetId) {
      return;
    }
    setRuntimeFor(targetId, updates);
  },
  setComposerConfig: (config: ComposerTurnConfig) => {
    mockCodexStore.setState((state) => ({
      ...state,
      composerConfig: { ...config },
    }));
  },
  setMutationPending: (isPending: boolean) => {
    mockCodexStore.setState((state) => ({
      ...state,
      mutationPending: isPending,
    }));
  },
  setInterruptPending: (isPending: boolean) => {
    mockCodexStore.setState((state) => ({
      ...state,
      interruptPending: isPending,
    }));
  },
  appendUserMessage: (conversationId: string, text: string) => {
    if (!text.trim()) {
      return;
    }
    setTranscriptFor(conversationId, (current) => {
      const timestamp = new Date().toISOString();
      const turnId = current.turnOrder[0] ?? 'mock-turn-1';
      const turn = ensureMockTurn(current, turnId);
      const newCell: TranscriptUserMessageCell = {
        id: `mock-user-${timestamp}`,
        timestamp,
        eventIds: [`evt-user-${timestamp}`],
        kind: 'user-message',
        message: text.trim(),
        messageKind: 'plain',
        images: null,
        itemId: null,
      };
      const nextTurn = {
        ...turn,
        cells: [...turn.cells, newCell],
      };
      const turnOrder = current.turnOrder.includes(turnId)
        ? current.turnOrder
        : [...current.turnOrder, turnId];
      return {
        ...current,
        turns: { ...current.turns, [turnId]: nextTurn },
        turnOrder,
      };
    });
  },
  setEventsLog: (
    conversationId: string,
    options: { jsonl: string; eventCount?: number }
  ) => {
    updateEntry(conversationId, (entry) => ({
      ...entry,
      eventsJsonl: options.jsonl,
      eventCount: options.eventCount ?? entry.eventCount,
    }));
  },
  getConversationEntry: (conversationId: string) =>
    mockCodexStore.getState().entries[conversationId] ??
    createConversationEntry({
      state: createInitialConversationState(),
    }),
  getActiveConversationId: () => mockCodexStore.getState().activeConversationId,
  getComposerConfig: () => mockCodexStore.getState().composerConfig,
};

export const sampleConversationId =
  sampleConversationSummaries[0]?.conversationId ?? 'storybook-session';
export const sampleWorkspacePath = '/tmp/storybook-workspace';
export const defaultRuntime = sampleConversationRuntime;
export const defaultTranscript = sampleTranscript;
