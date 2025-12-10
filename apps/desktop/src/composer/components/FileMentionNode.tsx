import {
  $applyNodeReplacement,
  DecoratorNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical';
import type React from 'react';

export type FileMentionPayload = {
  path: string;
  label: string;
};

export type SerializedFileMentionNode = Spread<
  {
    type: 'file-mention';
    version: 1;
  } & FileMentionPayload,
  SerializedLexicalNode
>;

const FileMention = ({ path, label }: FileMentionPayload) => (
  <span
    className="inline-flex items-center gap-1 rounded-full bg-muted text-foreground border border-border px-2 py-0.5 text-transcript-micro leading-transcript font-semibold whitespace-nowrap"
    title={path}
  >
    @{label}
  </span>
);

export class FileMentionNode extends DecoratorNode<React.ReactElement> {
  __path: string;
  __label: string;

  constructor(path: string, label: string, key?: NodeKey) {
    super(key);
    this.__path = path;
    this.__label = label;
  }

  static getType(): string {
    return 'file-mention';
  }

  static clone(node: FileMentionNode): FileMentionNode {
    return new FileMentionNode(node.__path, node.__label, node.__key);
  }

  static importJSON(
    serializedNode: SerializedFileMentionNode
  ): FileMentionNode {
    const { path, label } = serializedNode;
    return new FileMentionNode(path, label);
  }

  exportJSON(): SerializedFileMentionNode {
    return {
      type: 'file-mention',
      version: 1,
      path: this.__path,
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
    return <FileMention path={this.__path} label={this.__label} />;
  }

  isInline(): boolean {
    return true;
  }

  isIsolated(): boolean {
    return true;
  }

  getTextContent(): string {
    return `@${this.__path}`;
  }

  getPath(): string {
    return this.__path;
  }

  getLabel(): string {
    return this.__label;
  }
}

export const $createFileMentionNode = ({ path, label }: FileMentionPayload) =>
  $applyNodeReplacement(new FileMentionNode(path, label));

export const $isFileMentionNode = (node: unknown): node is FileMentionNode =>
  node instanceof FileMentionNode;
