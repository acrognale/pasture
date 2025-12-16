import type { PropsWithChildren } from 'react';
import { createContext, useCallback, useContext, useMemo } from 'react';
import { useStore } from 'zustand';

import { usePanelManagerStore } from '~/panels/PanelManagerProvider';
import { useWorkspaceActions } from '~/workspace';

import type { ReviewNavigationIntent } from './intents';
import type { NavigationActions, NavigationStore } from './store';
import { createNavigationStore } from './store';

const NavigationContext = createContext<NavigationStore | null>(null);

export function NavigationProvider({ children }: PropsWithChildren) {
  const workspaceActions = useWorkspaceActions();
  const panelManagerStore = usePanelManagerStore();

  const openReview = useCallback(
    (intent: ReviewNavigationIntent) => {
      const threadId = workspaceActions.getThreadIdForConversation(
        intent.conversationId
      );
      const hostId = `conversation:${intent.workspacePath}:${threadId ?? intent.conversationId}`;

      const focusFilePath = intent.focusFilePath ?? null;

      if (intent.mode === 'repo') {
        if (!intent.repoParams) {
          return;
        }
        panelManagerStore.getState().actions.open(
          hostId,
          'utility',
          'conversation.review',
          {
            mode: 'repo',
            workspacePath: intent.workspacePath,
            conversationId: intent.conversationId,
            repoParams: intent.repoParams,
          },
          { reveal: { focusFilePath } }
        );
        return;
      }

      panelManagerStore.getState().actions.open(
        hostId,
        'utility',
        'conversation.review',
        {
          mode: 'turn',
          workspacePath: intent.workspacePath,
          conversationId: intent.conversationId,
        },
        { reveal: { focusFilePath } }
      );
    },
    [panelManagerStore, workspaceActions]
  );

  const store = useMemo(
    () =>
      createNavigationStore({
        openReview,
      }),
    [openReview]
  );

  return (
    <NavigationContext.Provider value={store}>
      {children}
    </NavigationContext.Provider>
  );
}

function useNavigationStore(): NavigationStore {
  const store = useContext(NavigationContext);
  if (!store) {
    throw new Error('NavigationProvider is missing in the component tree.');
  }
  return store;
}

export function useNavigationStoreApi(): NavigationStore {
  return useNavigationStore();
}

export function useNavigation<T>(
  selector: (state: ReturnType<NavigationStore['getState']>) => T
): T {
  const store = useNavigationStore();
  return useStore(store, selector);
}

export function useNavigationActions(): NavigationActions {
  return useNavigation((state) => state.actions);
}
