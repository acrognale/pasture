import {
  $applyNodeReplacement,
  DecoratorNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical';
import type React from 'react';

export type FileMentionPayload = {
  kind: 'file';
  path: string;
  label: string;
};

export type SymbolMentionPayload = {
  kind: 'symbol';
  name: string;
  filePath: string;
  line: number;
  kindLabel?: string | null;
};

export type ThreadMentionPayload = {
  kind: 'thread';
  threadId: string;
  label: string;
};

export type MentionNodePayload =
  | FileMentionPayload
  | SymbolMentionPayload
  | ThreadMentionPayload;

export type SerializedMentionNode = Spread<
  {
    type: 'mention';
    version: 1;
  } & MentionNodePayload,
  SerializedLexicalNode
>;

const formatSymbolLocation = (filePath: string, line: number): string =>
  `${filePath}:${line}`;

const MentionPill = (payload: MentionNodePayload) => {
  const { kind } = payload;

  const baseClassName =
    'inline-flex items-center gap-1 rounded-full bg-muted text-foreground border border-border px-2 py-0.5 text-transcript-base leading-none font-semibold whitespace-nowrap';

  if (kind === 'file') {
    return (
      <span className={baseClassName} title={payload.path}>
        @{payload.label}
      </span>
    );
  }

  if (kind === 'symbol') {
    return (
      <span
        className={baseClassName}
        title={`${payload.name} (${formatSymbolLocation(payload.filePath, payload.line)})`}
      >
        <span className="font-semibold leading-none">{payload.name}</span>
      </span>
    );
  }

  return (
    <span className={baseClassName} title={payload.threadId}>
      Thread: {payload.label}
    </span>
  );
};

export class MentionNode extends DecoratorNode<React.ReactElement> {
  __data: MentionNodePayload;

  constructor(data: MentionNodePayload, key?: NodeKey) {
    super(key);
    this.__data = { ...data };
  }

  static getType(): string {
    return 'mention';
  }

  static clone(node: MentionNode): MentionNode {
    return new MentionNode({ ...node.__data }, node.__key);
  }

  static importJSON(serializedNode: SerializedMentionNode): MentionNode {
    const { kind } = serializedNode;
    switch (kind) {
      case 'file':
        return new MentionNode({
          kind: 'file',
          path: serializedNode.path,
          label: serializedNode.label,
        });
      case 'symbol':
        return new MentionNode({
          kind: 'symbol',
          name: serializedNode.name,
          filePath: serializedNode.filePath,
          line: serializedNode.line,
          kindLabel: serializedNode.kindLabel,
        });
      case 'thread':
        return new MentionNode({
          kind: 'thread',
          threadId: serializedNode.threadId,
          label: serializedNode.label,
        });
      default:
        return new MentionNode(serializedNode as MentionNodePayload);
    }
  }

  exportJSON(): SerializedMentionNode {
    return {
      type: 'mention',
      version: 1,
      ...this.__data,
    };
  }

  createDOM(): HTMLElement {
    return document.createElement('span');
  }

  updateDOM(): false {
    return false;
  }

  decorate(): React.ReactElement {
    return <MentionPill {...this.__data} />;
  }

  isInline(): boolean {
    return true;
  }

  isIsolated(): boolean {
    return true;
  }

  getKind(): MentionNodePayload['kind'] {
    return this.__data.kind;
  }

  getPath(): string | undefined {
    return this.__data.kind === 'file' ? this.__data.path : undefined;
  }

  getLabel(): string | undefined {
    if (this.__data.kind === 'file') return this.__data.label;
    if (this.__data.kind === 'thread') return this.__data.label;
    return undefined;
  }

  getName(): string | undefined {
    return this.__data.kind === 'symbol' ? this.__data.name : undefined;
  }

  getFilePath(): string | undefined {
    return this.__data.kind === 'symbol' ? this.__data.filePath : undefined;
  }

  getLine(): number | undefined {
    return this.__data.kind === 'symbol' ? this.__data.line : undefined;
  }

  getSymbolKind(): string | null | undefined {
    return this.__data.kind === 'symbol' ? this.__data.kindLabel : undefined;
  }

  getThreadId(): string | undefined {
    return this.__data.kind === 'thread' ? this.__data.threadId : undefined;
  }

  getTextContent(): string {
    switch (this.__data.kind) {
      case 'file':
        return `@file:${this.__data.path}`;
      case 'symbol':
        return `@symbol:${this.__data.name} (${formatSymbolLocation(
          this.__data.filePath,
          this.__data.line
        )})`;
      case 'thread':
        return `@thread:${this.__data.threadId}`;
      default:
        return '';
    }
  }
}

export const $createMentionNode = (payload: MentionNodePayload) =>
  $applyNodeReplacement(new MentionNode(payload));

export const $isMentionNode = (node: unknown): node is MentionNode =>
  node instanceof MentionNode;
