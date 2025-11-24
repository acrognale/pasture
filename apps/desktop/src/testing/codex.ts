/* eslint-disable @typescript-eslint/require-await */
import { vi } from 'vitest';
import type { AddConversationSubscriptionResponse } from '~/codex.gen/AddConversationSubscriptionResponse';
import type { AuthState } from '~/codex.gen/AuthState';
import type { CodexEvent } from '~/codex.gen/CodexEvent';
import type { ComposerTurnConfigPayload } from '~/codex.gen/ComposerTurnConfigPayload';
import type { ConversationEventPayload } from '~/codex.gen/ConversationEventPayload';
import type { EventMsg } from '~/codex.gen/EventMsg';
import type { GetTurnDiffRangeResponse } from '~/codex.gen/GetTurnDiffRangeResponse';
import type { InitializeThreadResponse } from '~/codex.gen/InitializeThreadResponse';
import type { InterruptConversationResponse } from '~/codex.gen/InterruptConversationResponse';
import type { ListThreadRolloutsResponse } from '~/codex.gen/ListThreadRolloutsResponse';
import type { ListThreadsResponse } from '~/codex.gen/ListThreadsResponse';
import type { ListTurnSnapshotsResponse } from '~/codex.gen/ListTurnSnapshotsResponse';
import type { NewThreadResponse } from '~/codex.gen/NewThreadResponse';
import type { ReasoningSummary } from '~/codex.gen/ReasoningSummary';
import type { SessionConfiguredEvent } from '~/codex.gen/SessionConfiguredEvent';
import type { WorkspaceComposerDefaults } from '~/codex.gen/WorkspaceComposerDefaults';

type AsyncFn<TArgs extends unknown[], TResult> = (
  ...args: TArgs
) => Promise<TResult>;

const codexResetters: Array<() => void> = [];
let mockEventIdCounter = 0;

const defineStub = <TArgs extends unknown[], TResult>(
  impl: AsyncFn<TArgs, TResult>
) => {
  const fn = vi.fn<AsyncFn<TArgs, TResult>>(impl);
  codexResetters.push(() => {
    fn.mockReset();
    fn.mockImplementation(impl);
  });
  return fn;
};

const createDefaultAuthState = (): AuthState => ({
  isAuthenticated: true,
  mode: null,
  email: 'codex@test.local',
  planType: 'test',
  requiresAuth: false,
  lastError: null,
});

const createDefaultNewThreadResponse = (): NewThreadResponse => ({
  threadId: 'mock-thread',
  conversationId: 'mock-conversation',
  model: 'gpt-5-codex',
  reasoningEffort: 'medium',
  rolloutPath: '',
});

const createDefaultInterruptResponse = (): InterruptConversationResponse => ({
  abortReason: 'interrupted',
});

const createDefaultSessionConfiguredEvent = (): SessionConfiguredEvent => ({
  session_id: 'mock-conversation',
  model: 'gpt-5-codex',
  model_provider_id: 'openai',
  approval_policy: 'on-request',
  sandbox_policy: { type: 'danger-full-access' },
  cwd: '/tmp',
  reasoning_effort: null,
  history_log_id: BigInt(0),
  history_entry_count: 0,
  initial_messages: [],
  rollout_path: '/tmp/mock-rollout.jsonl',
});

const createDefaultInitializeThreadResponse = (): InitializeThreadResponse => ({
  sessionConfigured: createDefaultSessionConfiguredEvent(),
  reasoningSummary: 'auto' satisfies ReasoningSummary,
});

const createDefaultComposerConfigPayload = (): ComposerTurnConfigPayload => ({
  model: null,
  reasoningEffort: null,
  summary: null,
  sandbox: null,
  approval: null,
});

const createDefaultAddConversationSubscriptionResponse =
  (): AddConversationSubscriptionResponse => ({
    subscriptionId: 'mock-subscription',
  });

const mockCodexNamespace = {
  listThreads: defineStub<[], ListThreadsResponse>(async () => ({
    items: [],
  })),
  newThread: defineStub(async () => createDefaultNewThreadResponse()),
  initializeThread: defineStub(
    async (): Promise<InitializeThreadResponse> =>
      createDefaultInitializeThreadResponse()
  ),
  listThreadRollouts: defineStub<[], ListThreadRolloutsResponse>(
    async (): Promise<ListThreadRolloutsResponse> => ({
      threadId: 'mock-thread',
      currentConversationId: 'mock-conversation',
      rollouts: [],
    })
  ),
  switchThreadRollout: defineStub(async () => ({
    conversationId: 'mock-conversation',
    sessionConfigured: createDefaultSessionConfiguredEvent(),
    reasoningSummary: 'auto' satisfies ReasoningSummary,
  })),
  compactConversation: defineStub(async () => undefined),
  sendUserMessage: defineStub(async () => undefined),
  interruptConversation: defineStub(async () =>
    createDefaultInterruptResponse()
  ),
  listTurnSnapshots: defineStub(
    async (): Promise<ListTurnSnapshotsResponse> => ({
      disabled: true,
      baseCommitId: null,
      snapshots: [],
    })
  ),
  getComposerConfig: defineStub(async () =>
    createDefaultComposerConfigPayload()
  ),
  updateComposerConfig: defineStub(async () => undefined),
  getWorkspaceComposerDefaults: defineStub(
    async (): Promise<WorkspaceComposerDefaults> => ({
      model: null,
      reasoningEffort: null,
      reasoningSummary: null,
      sandbox: null,
      approval: null,
    })
  ),
  addConversationListener: defineStub(async () =>
    createDefaultAddConversationSubscriptionResponse()
  ),
  removeConversationListener: defineStub(async () => undefined),
  respondExecApproval: defineStub(async () => undefined),
  respondPatchApproval: defineStub(async () => undefined),
  getTurnDiffRange: defineStub(
    async (): Promise<GetTurnDiffRangeResponse> => ({
      unifiedDiff: '',
    })
  ),
  getAuthState: defineStub(async () => createDefaultAuthState()),
  workspace: {
    listRecentWorkspaces: defineStub(async () => []),
    openWorkspace: defineStub(async () => '/tmp/workspace'),
    createWorkspaceWindow: defineStub(async () => undefined),
    setWindowTitle: defineStub(async () => undefined),
    browseForWorkspace: defineStub(async () => null),
  },
};

vi.mock('~/codex/client', () => ({
  Codex: mockCodexNamespace,
}));

type Listener = (event: CodexEvent) => void;
const codexListeners = new Set<Listener>();

let defaultConversationId: string | null = 'mock-conversation';

const subscribeToCodexEvents = (listener: Listener): (() => void) => {
  codexListeners.add(listener);
  return () => {
    codexListeners.delete(listener);
  };
};

const emitEvent = (event: CodexEvent) => {
  codexListeners.forEach((listener) => listener(event));
};

const resetEventBuses = () => {
  codexListeners.clear();
  defaultConversationId = 'mock-conversation';
};

vi.mock('~/codex/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../codex/events')>();
  return {
    ...actual,
    subscribeToCodexEvents,
    ensureTauriEnvironment: (): void => undefined,
    isTauriEnvironment: (): boolean => true,
  };
});

export const mockCodex = {
  stub: mockCodexNamespace,
  reset: (): void => {
    codexResetters.forEach((reset) => reset());
  },
};

type ConversationEmitOptions = {
  conversationId?: string;
  turnId?: string;
};

const generateTurnId = (eventType: string) =>
  `mock-turn::${eventType}::${Date.now()}`;

export const mockEvents = {
  emit(event: CodexEvent) {
    emitEvent(event);
  },
  emitConversation(event: EventMsg, options: ConversationEmitOptions = {}) {
    const conversationId = options.conversationId ?? defaultConversationId;

    if (!conversationId) {
      throw new Error(
        'mockEvents.emitConversation requires a conversationId. Provide one in options or set a default via setDefaultConversationId().'
      );
    }

    const turnId = options.turnId ?? generateTurnId(event.type);
    const payload: ConversationEventPayload = {
      conversationId,
      turnId,
      eventId: `evt-${(mockEventIdCounter += 1)}`,
      event,
      timestamp: new Date().toISOString(),
    };

    emitEvent({ kind: 'conversation-event', payload });
  },
  emitAuth(authState: AuthState) {
    emitEvent({ kind: 'auth-updated', payload: authState });
  },
  setDefaultConversationId(conversationId: string | null) {
    defaultConversationId = conversationId;
  },
  reset() {
    resetEventBuses();
    mockEventIdCounter = 0;
  },
};

let installed = false;

export const installTestingEnvironment = () => {
  if (!installed) {
    installed = true;
  }

  mockCodex.reset();
  mockEvents.reset();
};

export const resetTestingEnvironment = () => {
  if (!installed) {
    return;
  }

  mockCodex.reset();
  mockEvents.reset();
};
