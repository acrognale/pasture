import type { Conversation } from '@pasture/protocol';

/**
 * Get all conversation forks at a specific user message, relative to the current conversation.
 *
 * The algorithm accounts for nested forks:
 * - `forkedAtNthUserMessage = N` means the conversation shares messages 1..N with its parent
 * - To find forks at message N, we first find the "owner" of that message in the current
 *   conversation's lineage, then find all conversations that forked from that owner at N.
 *
 * @param currentConversation - The conversation being viewed
 * @param nthUserMessage - The user message index to find forks at
 * @param allConversations - All conversations in the thread
 * @returns Array of conversations that represent different forks at this message
 */
export function getForksAtMessage(
  currentConversation: Conversation,
  nthUserMessage: number,
  allConversations: Conversation[]
): Conversation[] {
  const byId = new Map(allConversations.map((c) => [c.id, c]));

  // Find the "owner" of this message by walking up the lineage.
  // The owner is the conversation that created (or first introduced) this message.
  // If a conversation forked at position >= N, it inherited message N from its parent.
  let owner = currentConversation;
  while (
    owner.forkedAtNthUserMessage != null &&
    owner.forkedAtNthUserMessage >= nthUserMessage
  ) {
    const parent = byId.get(owner.parentConversationId!);
    if (!parent) {
      // Parent not found, stop here
      break;
    }
    owner = parent;
  }

  // Find all conversations that forked from the owner at exactly this message
  const forksAtN = allConversations.filter(
    (c) =>
      c.parentConversationId === owner.id &&
      c.forkedAtNthUserMessage === nthUserMessage
  );

  // Return owner (original) + all forks at N, sorted by creation time
  const result = [owner, ...forksAtN];
  return result.sort((a, b) => {
    const dateComparison = a.createdAt.localeCompare(b.createdAt);
    if (dateComparison !== 0) {
      return dateComparison;
    }
    return a.id.localeCompare(b.id);
  });
}
