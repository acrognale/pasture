import type { PropsWithChildren } from 'react';
import { createContext, useCallback, useContext, useMemo } from 'react';
import { useStore } from 'zustand';

import { usePanelManagerStore } from '~/panels/PanelManagerProvider';
import { getConversationHostId } from '~/panels/host-ids';

import type { ReviewNavigationIntent } from './intents';
import type { NavigationActions, NavigationStore } from './store';
import { createNavigationStore } from './store';

const NavigationContext = createContext<NavigationStore | null>(null);

export function NavigationProvider({ children }: PropsWithChildren) {
  const panelManagerStore = usePanelManagerStore();

  const openReview = useCallback(
    (intent: ReviewNavigationIntent) => {
      const hostId = getConversationHostId(intent.workspacePath);

      const focusFilePath = intent.focusFilePath ?? null;
      const threadTitle = intent.threadTitle ?? null;

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
            threadTitle,
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
          threadTitle,
        },
        { reveal: { focusFilePath } }
      );
    },
    [panelManagerStore]
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
