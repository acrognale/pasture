import { createContext, useContext } from 'react';

import type { DockId, HostId, PanelInstanceId } from './types';

export type PanelRuntime = {
  hostId: HostId;
  dockId: DockId;
  instanceId: PanelInstanceId;
  params: unknown;
  state: unknown;
  setState: (state: unknown) => void;
  reveal: unknown;
  consumeReveal: () => void;
  close: () => void;
};

const PanelRuntimeContext = createContext<PanelRuntime | null>(null);

export function usePanelRuntime(): PanelRuntime {
  const runtime = useContext(PanelRuntimeContext);
  if (!runtime) {
    throw new Error(
      'usePanelRuntime must be used within a PanelRuntimeContext.'
    );
  }
  return runtime;
}

export const PanelRuntimeProvider = PanelRuntimeContext.Provider;
