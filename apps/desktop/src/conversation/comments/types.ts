export type MessageComment = {
  id: string;
  conversationId: string;
  cellId: string;
  createdAt: string;
  isSubmitted: boolean;
  selectionText: string;
  selectionPreview: string;
  selectionStartOffset: number | null;
  selectionEndOffset: number | null;
  selectionBlockIndex: number | null;
  commentText: string;
};

export type DraftTarget = {
  conversationId: string;
  cellId: string;
  selectionText: string;
  selectionPreview: string;
  selectionStartOffset: number | null;
  selectionEndOffset: number | null;
  selectionBlockIndex: number | null;
};
