import { describe, expect, test } from 'vitest';

import { registerPanelKind } from '../registry';
import { createPanelManagerStore } from '../manager';
import type { PanelComponentProps } from '../types';

function TestPanel(_props: PanelComponentProps) {
  return null;
}

describe('panel manager', () => {
  test('dedupes by key and updates params', () => {
    const kindId = 'test.dedupe.kind';
    registerPanelKind({
      kindId,
      scope: 'conversation',
      title: () => 'Test',
      Component: TestPanel,
      dedupeKey: (params) => {
        const p = params as { key: string };
        return p.key;
      },
    });

    const store = createPanelManagerStore();
    const { actions } = store.getState();

    const hostId = 'host-1';
    const first = actions.open(hostId, 'editor', kindId, { key: 'a', n: 1 });
    const second = actions.open(hostId, 'editor', kindId, { key: 'a', n: 2 });

    expect(second).toBe(first);

    const host = store.getState().hosts[hostId]!;
    expect(host.instances[first]!.params).toEqual({ key: 'a', n: 2 });
  });

  test('closing last tab clears dock root', () => {
    const kindId = 'test.close.kind';
    registerPanelKind({
      kindId,
      scope: 'conversation',
      title: () => 'Test',
      Component: TestPanel,
    });

    const store = createPanelManagerStore();
    const { actions } = store.getState();

    const hostId = 'host-2';
    const instanceId = actions.open(hostId, 'utility', kindId, { x: 1 });
    actions.close(hostId, instanceId);

    const host = store.getState().hosts[hostId]!;
    expect(host.docks.utility.root).toBeNull();
    expect(host.instances[instanceId]).toBeUndefined();
  });
});

