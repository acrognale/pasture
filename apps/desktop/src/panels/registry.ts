import type { PanelKindDefinition, PanelKindId } from './types';

const registry = new Map<PanelKindId, PanelKindDefinition>();

export function registerPanelKind(definition: PanelKindDefinition) {
  if (registry.has(definition.kindId)) {
    return;
  }
  registry.set(definition.kindId, definition);
}

export function getPanelKind(kindId: PanelKindId): PanelKindDefinition {
  const kind = registry.get(kindId);
  if (!kind) {
    throw new Error(`Unknown panel kind: ${kindId}`);
  }
  return kind;
}

