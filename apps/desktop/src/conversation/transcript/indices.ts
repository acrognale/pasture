export type Indices = {
  itemById: Record<string, number>;
  execByCallId: Record<string, number>;
  toolByTypeAndCallId: Record<string, number>;
  patchByCallId: Record<string, number>;
};

const createIndex = () => Object.create(null) as Record<string, number>;

export const emptyIndices = (): Indices => ({
  itemById: createIndex(),
  execByCallId: createIndex(),
  toolByTypeAndCallId: createIndex(),
  patchByCallId: createIndex(),
});

export const cloneIndices = (indices: Indices): Indices => ({
  itemById: { ...indices.itemById },
  execByCallId: { ...indices.execByCallId },
  toolByTypeAndCallId: { ...indices.toolByTypeAndCallId },
  patchByCallId: { ...indices.patchByCallId },
});

export const makeKey = (toolType: string, callId: string) =>
  `${toolType}:${callId}`;
