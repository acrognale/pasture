/* eslint-disable @typescript-eslint/require-await */
import type { AddConversationSubscriptionResponse } from '@pasture/protocol';
import type { AuthState } from '@pasture/protocol';
import type { CodexEvent } from '@pasture/protocol';
import type { ComposerTurnConfigPayload } from '@pasture/protocol';
import type { ConversationEventPayload } from '@pasture/protocol';
import type { EventMsg } from '@pasture/protocol';
import type { GetTurnDiffRangeResponse } from '@pasture/protocol';
import type { HandoffConversationResponse } from '@pasture/protocol';
import type { InitializeThreadResponse } from '@pasture/protocol';
import type { InterruptConversationResponse } from '@pasture/protocol';
import type { ListThreadConversationsResponse } from '@pasture/protocol';
import type { ListThreadsResponse } from '@pasture/protocol';
import type { ListTurnSnapshotsResponse } from '@pasture/protocol';
import type { NewThreadResponse } from '@pasture/protocol';
import type { ReasoningSummary } from '@pasture/protocol';
import type { SessionConfiguredEvent } from '@pasture/protocol';
import type {
  CreateMessageCommentResponse,
  ListMessageCommentsResponse,
  MessageComment,
} from '@pasture/protocol';
import type { WorkspaceSettings } from '@pasture/protocol';
import { vi } from 'vitest';

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

const createDefaultHandoffResponse = (): HandoffConversationResponse => ({
  threadId: 'handoff-thread',
  conversationId: 'handoff-conversation',
  composerDraft: 'Continue here',
  title: 'Handoff thread',
});

const createDefaultComposerConfigPayload = (): ComposerTurnConfigPayload => ({
  model: null,
  reasoningEffort: null,
  summary: null,
  sandbox: null,
  approval: null,
  webSearchEnabled: false,
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
  listThreadConversations: defineStub<[], ListThreadConversationsResponse>(
    async (): Promise<ListThreadConversationsResponse> => ({
      threadId: 'mock-thread',
      currentConversationId: 'mock-conversation',
      conversations: [],
    })
  ),
  switchConversation: defineStub(async () => ({
    conversationId: 'mock-conversation',
    sessionConfigured: createDefaultSessionConfiguredEvent(),
    reasoningSummary: 'auto' satisfies ReasoningSummary,
  })),
  compactConversation: defineStub(async () => undefined),
  handoffConversation: defineStub(async () => createDefaultHandoffResponse()),
  sendUserMessage: defineStub(async () => undefined),
  savePastedImage: defineStub(async () => ({
    path: '/tmp/mock-image.png',
    width: 0,
    height: 0,
    fileName: 'mock-image.png',
  })),
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
  getComposerConfig: defineStub(async (_params) =>
    createDefaultComposerConfigPayload()
  ),
  updateComposerConfig: defineStub(async (_params) => undefined),
  getWorkspaceComposerDefaults: defineStub(
    async (): Promise<WorkspaceSettings> => ({
      model: null,
      reasoningEffort: null,
      reasoningSummary: null,
      sandbox: null,
      approval: null,
      webSearchEnabled: null,
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
  listMessageComments: defineStub<[], ListMessageCommentsResponse>(
    async () => ({
      comments: [],
    })
  ),
  createMessageComment: defineStub<
    [Partial<MessageComment>],
    CreateMessageCommentResponse
  >(async (partial: Partial<MessageComment>) => ({
    comment: {
      id:
        partial.id ?? `mock-comment-${Math.random().toString(36).slice(2, 8)}`,
      conversationId: partial.conversationId ?? 'mock-conversation',
      cellId: partial.cellId ?? 'mock-cell',
      selectionText: partial.selectionText ?? 'mock selection',
      selectionPreview: partial.selectionPreview ?? 'mock selection',
      selectionStartOffset: partial.selectionStartOffset ?? 0,
      selectionEndOffset: partial.selectionEndOffset ?? 3,
      selectionBlockIndex: partial.selectionBlockIndex ?? null,
      commentText: partial.commentText ?? 'mock comment',
      createdAt: partial.createdAt ?? new Date().toISOString(),
      isSubmitted: partial.isSubmitted ?? false,
    },
  })),
  updateMessageComment: defineStub(async () => undefined),
  setMessageCommentsSubmitted: defineStub(async () => undefined),
  deleteMessageComment: defineStub(async () => undefined),
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
