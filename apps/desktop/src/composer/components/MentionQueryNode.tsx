import {
  $applyNodeReplacement,
  $createTextNode,
  ElementNode,
  type LexicalNode,
  type SerializedElementNode,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical';

export type MentionQueryPayload = {
  text?: string;
};

export type SerializedMentionQueryNode = Spread<
  {
    type: 'mention-query';
    version: 1;
  } & MentionQueryPayload,
  SerializedElementNode
>;

export class MentionQueryNode extends ElementNode {
  static getType(): string {
    return 'mention-query';
  }

  static clone(node: MentionQueryNode): MentionQueryNode {
    return new MentionQueryNode(node.__key);
  }

  static importJSON(
    serializedNode: SerializedMentionQueryNode
  ): MentionQueryNode {
    const node = new MentionQueryNode();
    const { text } = serializedNode;
    if (text) {
      node.append($createTextNode(text));
    }
    return node;
  }

  exportJSON(): SerializedMentionQueryNode {
    return {
      ...super.exportJSON(),
      type: 'mention-query',
      version: 1,
      text: this.getTextContent().replace(/^@/, ''),
    };
  }

  createDOM(): HTMLElement {
    const dom = document.createElement('span');
    dom.className =
      'inline-flex items-center gap-1 rounded-full bg-muted text-foreground border border-border pl-2 pr-2 py-0.5 text-transcript-micro leading-transcript font-semibold whitespace-nowrap min-h-[24px]';
    return dom;
  }

  updateDOM(): false {
    return false;
  }

  isInline(): boolean {
    return true;
  }

  isIsolated(): boolean {
    return false;
  }

  canBeEmpty(): boolean {
    return true;
  }

  getTextContent(): string {
    return `@${super.getTextContent()}`;
  }
}

export const $createMentionQueryNode = (payload?: MentionQueryPayload) => {
  const node = new MentionQueryNode();
  node.append($createTextNode(payload?.text ?? ''));
  return $applyNodeReplacement(node);
};

export const $isMentionQueryNode = (
  node: LexicalNode | null | undefined
): node is MentionQueryNode => node instanceof MentionQueryNode;
