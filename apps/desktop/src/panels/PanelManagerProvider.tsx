import type { PropsWithChildren } from 'react';
import { createContext, useContext, useMemo } from 'react';
import { useStore } from 'zustand';

import type { PanelManagerStore } from './manager';
import { createPanelManagerStore } from './manager';

const PanelManagerContext = createContext<PanelManagerStore | null>(null);

export function PanelManagerProvider({ children }: PropsWithChildren) {
  const store = useMemo(() => createPanelManagerStore(), []);
  return (
    <PanelManagerContext.Provider value={store}>
      {children}
    </PanelManagerContext.Provider>
  );
}

export function usePanelManagerStore(): PanelManagerStore {
  const store = useContext(PanelManagerContext);
  if (!store) {
    throw new Error('PanelManagerProvider is missing in the component tree.');
  }
  return store;
}

export function usePanelManager<T>(
  selector: (state: ReturnType<PanelManagerStore['getState']>) => T
): T {
  const store = usePanelManagerStore();
  return useStore(store, selector);
}
