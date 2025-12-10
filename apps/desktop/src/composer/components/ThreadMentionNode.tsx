import {
  $applyNodeReplacement,
  DecoratorNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical';
import type React from 'react';

export type ThreadMentionPayload = {
  threadId: string;
  label: string;
};

export type SerializedThreadMentionNode = Spread<
  {
    type: 'thread-mention';
    version: 1;
  } & ThreadMentionPayload,
  SerializedLexicalNode
>;

const ThreadMention = ({ label, threadId }: ThreadMentionPayload) => (
  <span
    className="inline-flex items-center gap-1 rounded-full bg-muted text-foreground border border-border px-2 py-0.5 text-transcript-micro leading-transcript font-semibold whitespace-nowrap"
    title={threadId}
  >
    Thread: {label}
  </span>
);

export class ThreadMentionNode extends DecoratorNode<React.ReactElement> {
  __threadId: string;
  __label: string;

  constructor(threadId: string, label: string, key?: NodeKey) {
    super(key);
    this.__threadId = threadId;
    this.__label = label;
  }

  static getType(): string {
    return 'thread-mention';
  }

  static clone(node: ThreadMentionNode): ThreadMentionNode {
    return new ThreadMentionNode(node.__threadId, node.__label, node.__key);
  }

  static importJSON(
    serializedNode: SerializedThreadMentionNode
  ): ThreadMentionNode {
    const { threadId, label } = serializedNode;
    return new ThreadMentionNode(threadId, label);
  }

  exportJSON(): SerializedThreadMentionNode {
    return {
      type: 'thread-mention',
      version: 1,
      threadId: this.__threadId,
      label: this.__label,
    };
  }

  createDOM(): HTMLElement {
    return document.createElement('span');
  }

  updateDOM(): false {
    return false;
  }

  decorate(): React.ReactElement {
    return <ThreadMention threadId={this.__threadId} label={this.__label} />;
  }

  isInline(): boolean {
    return true;
  }

  isIsolated(): boolean {
    return true;
  }

  getThreadId(): string {
    return this.__threadId;
  }

  getLabel(): string {
    return this.__label;
  }

  getTextContent(): string {
    return `@thread:${this.__threadId}`;
  }
}

export const $createThreadMentionNode = ({
  threadId,
  label,
}: ThreadMentionPayload) =>
  $applyNodeReplacement(new ThreadMentionNode(threadId, label));

export const $isThreadMentionNode = (
  node: unknown
): node is ThreadMentionNode => node instanceof ThreadMentionNode;
