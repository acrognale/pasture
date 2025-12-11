import {
  $applyNodeReplacement,
  DecoratorNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical';
import type React from 'react';

export const formatSymbolLocation = (filePath: string, line: number): string =>
  `${filePath}:${line}`;

export type SymbolMentionPayload = {
  name: string;
  filePath: string;
  line: number;
  kind?: string | null;
};

export type SerializedSymbolMentionNode = Spread<
  {
    type: 'symbol-mention';
    version: 1;
  } & SymbolMentionPayload,
  SerializedLexicalNode
>;

const SymbolMention = ({ name, filePath, line }: SymbolMentionPayload) => (
  <span
    className="inline-flex items-center gap-1 rounded-full bg-muted text-foreground border border-border px-2 py-0.5 text-transcript-base leading-none font-semibold whitespace-nowrap"
    title={`${name} (${formatSymbolLocation(filePath, line)})`}
  >
    <span className="font-semibold leading-none">{name}</span>
  </span>
);

export class SymbolMentionNode extends DecoratorNode<React.ReactElement> {
  __name: string;
  __filePath: string;
  __line: number;
  __kind?: string | null;

  constructor(
    name: string,
    filePath: string,
    line: number,
    kind?: string | null,
    key?: NodeKey
  ) {
    super(key);
    this.__name = name;
    this.__filePath = filePath;
    this.__line = line;
    this.__kind = kind;
  }

  static getType(): string {
    return 'symbol-mention';
  }

  static clone(node: SymbolMentionNode): SymbolMentionNode {
    return new SymbolMentionNode(
      node.__name,
      node.__filePath,
      node.__line,
      node.__kind,
      node.__key
    );
  }

  static importJSON(
    serializedNode: SerializedSymbolMentionNode
  ): SymbolMentionNode {
    const { name, filePath, line, kind } = serializedNode;
    return new SymbolMentionNode(name, filePath, line, kind);
  }

  exportJSON(): SerializedSymbolMentionNode {
    return {
      type: 'symbol-mention',
      version: 1,
      name: this.__name,
      filePath: this.__filePath,
      line: this.__line,
      kind: this.__kind,
    };
  }

  createDOM(): HTMLElement {
    return document.createElement('span');
  }

  updateDOM(): false {
    return false;
  }

  decorate(): React.ReactElement {
    return (
      <SymbolMention
        name={this.__name}
        filePath={this.__filePath}
        line={this.__line}
        kind={this.__kind}
      />
    );
  }

  isInline(): boolean {
    return true;
  }

  isIsolated(): boolean {
    return true;
  }

  getName(): string {
    return this.__name;
  }

  getFilePath(): string {
    return this.__filePath;
  }

  getLine(): number {
    return this.__line;
  }

  getKind(): string | null | undefined {
    return this.__kind;
  }

  getTextContent(): string {
    return `#${this.__name} (${formatSymbolLocation(this.__filePath, this.__line)})`;
  }
}

export const $createSymbolMentionNode = ({
  name,
  filePath,
  line,
  kind,
}: SymbolMentionPayload) =>
  $applyNodeReplacement(new SymbolMentionNode(name, filePath, line, kind));

export const $isSymbolMentionNode = (
  node: unknown
): node is SymbolMentionNode => node instanceof SymbolMentionNode;
