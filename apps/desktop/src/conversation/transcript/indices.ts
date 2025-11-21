export type CellLocation = {
  turnId: string;
  cellIndex: number;
};

export type Indices = {
  itemById: Record<string, CellLocation>;
  execByCallId: Record<string, CellLocation>;
  toolByTypeAndCallId: Record<string, CellLocation>;
  patchByCallId: Record<string, CellLocation>;
};

const createIndex = () => Object.create(null) as Record<string, CellLocation>;

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
