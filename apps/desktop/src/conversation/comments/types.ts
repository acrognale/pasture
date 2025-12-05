export type DraftTarget = {
  conversationId: string;
  cellId: string;
  selectionText: string;
  selectionPreview: string;
  selectionStartOffset: number | null;
  selectionEndOffset: number | null;
  selectionBlockIndex: number | null;
};
