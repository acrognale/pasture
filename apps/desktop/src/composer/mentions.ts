import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $isElementNode,
  $isTextNode,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
} from 'lexical';

import {
  $createFileMentionNode,
  $isFileMentionNode,
  type FileMentionNode,
} from './components/FileMentionNode';
import {
  $createThreadMentionNode,
  $isThreadMentionNode,
  ThreadMentionNode,
  type ThreadMentionPayload,
} from './components/ThreadMentionNode';
import {
  $createSymbolMentionNode,
  $isSymbolMentionNode,
  type SymbolMentionNode,
  formatSymbolLocation,
} from './components/SymbolMentionNode';

export const SLASH_TRIGGER: RegExp = /(^|\s)\/([a-z0-9-]*)$/i;
export const FILE_MENTION_TEXT_PATTERN: RegExp = /(^|[\s])@([^\s@]*\/[^\s@]+)/g;
export const SYMBOL_MENTION_TRIGGER: RegExp = /(^|\s)#([^\s#]*)$/;
export const SYMBOL_MENTION_TEXT_PATTERN: RegExp =
  /(^|[\s])#([^\s#]+)\s+\(([^()]+):(\d+)\)/g;
export const THREAD_MENTION_TEXT_PATTERN: RegExp =
  /(^|[\s])@thread:([A-Za-z0-9_-]+)/g;

export type MentionKind = 'file' | 'symbol' | 'thread';

export type FileMention = {
  kind: 'file';
  path: string;
  label: string;
};

export type SymbolMention = {
  kind: 'symbol';
  name: string;
  filePath: string;
  line: number;
  kindLabel?: string | null;
};

export type ThreadMention = {
  kind: 'thread';
  threadId: string;
  label: string;
};

export type AnyMention = FileMention | SymbolMention | ThreadMention;
export type MentionLexicalNode =
  | FileMentionNode
  | SymbolMentionNode
  | ThreadMentionNode;

export const buildFileLabel = (path: string): string => {
  const segments = path.split(/[\\/]/);
  const label = segments[segments.length - 1];
  return label || path;
};

export const isMentionNode = (node: unknown): node is MentionLexicalNode =>
  $isFileMentionNode(node) ||
  $isSymbolMentionNode(node) ||
  $isThreadMentionNode(node);

export const mentionToStorageText = (mention: AnyMention): string => {
  switch (mention.kind) {
    case 'file':
      return `@${mention.path}`;
    case 'symbol':
      return `#${mention.name} (${formatSymbolLocation(
        mention.filePath,
        mention.line
      )})`;
    case 'thread':
      return `@thread:${mention.threadId}`;
    default:
      return '';
  }
};

export const mentionToSendText = (mention: AnyMention): string => {
  switch (mention.kind) {
    case 'file':
      return `@${mention.path}`;
    case 'symbol':
      return `${mention.name} (${formatSymbolLocation(
        mention.filePath,
        mention.line
      )})`;
    case 'thread':
      return `@thread:${mention.threadId}`;
    default:
      return '';
  }
};

export const nodeToMention = (
  node: LexicalNode
): AnyMention | null => {
  if ($isFileMentionNode(node)) {
    return {
      kind: 'file',
      path: node.getPath(),
      label: node.getLabel(),
    };
  }
  if ($isSymbolMentionNode(node)) {
    return {
      kind: 'symbol',
      name: node.getName(),
      filePath: node.getFilePath(),
      line: node.getLine(),
      kindLabel: node.getKind(),
    };
  }
  if ($isThreadMentionNode(node)) {
    return {
      kind: 'thread',
      threadId: node.getThreadId(),
      label: node.getLabel(),
    };
  }
  return null;
};

export const createMentionNode = (mention: AnyMention) => {
  switch (mention.kind) {
    case 'file':
      return $createFileMentionNode({
        path: mention.path,
        label: mention.label,
      });
    case 'symbol':
      return $createSymbolMentionNode({
        name: mention.name,
        filePath: mention.filePath,
        line: mention.line,
        kind: mention.kindLabel,
      });
    case 'thread':
      return $createThreadMentionNode({
        threadId: mention.threadId,
        label: mention.label,
      });
    default:
      return null;
  }
};

export const collectMentions = (editor: LexicalEditor): AnyMention[] => {
  return editor.getEditorState().read(() => {
    const result: AnyMention[] = [];
    const walk = (node: LexicalNode) => {
      const mention = nodeToMention(node);
      if (mention) {
        result.push(mention);
        return;
      }
      if ($isElementNode(node)) {
        node.getChildren().forEach(walk);
      }
    };
    $getRoot().getChildren().forEach(walk);
    return result;
  });
};

export const appendTextWithMentions = (
  paragraph: ReturnType<typeof $createParagraphNode>,
  line: string
) => {
  let cursor = 0;

  const findNextMention = (): null | {
    start: number;
    end: number;
    render: () => void;
  } => {
    FILE_MENTION_TEXT_PATTERN.lastIndex = cursor;
    SYMBOL_MENTION_TEXT_PATTERN.lastIndex = cursor;
    THREAD_MENTION_TEXT_PATTERN.lastIndex = cursor;

    const fileMatch = FILE_MENTION_TEXT_PATTERN.exec(line);
    const symbolMatch = SYMBOL_MENTION_TEXT_PATTERN.exec(line);
    const threadMatch = THREAD_MENTION_TEXT_PATTERN.exec(line);

    const candidates: Array<{
      match: RegExpExecArray;
      type: 'file' | 'symbol' | 'thread';
    }> = [];

    if (fileMatch) {
      candidates.push({ match: fileMatch, type: 'file' });
    }
    if (symbolMatch) {
      candidates.push({ match: symbolMatch, type: 'symbol' });
    }
    if (threadMatch) {
      candidates.push({ match: threadMatch, type: 'thread' });
    }

    if (candidates.length === 0) {
      return null;
    }

    const next = candidates.reduce(
      (current, candidate) => {
        if (!current) {
          return candidate;
        }
        return (candidate.match.index ?? 0) < (current.match.index ?? 0)
          ? candidate
          : current;
      },
      null as (typeof candidates)[number] | null
    );

    if (!next) {
      return null;
    }

    const matchIndex = next.match.index ?? 0;
    const prefix = next.match[1] ?? '';
    const start = matchIndex + prefix.length;
    const matchedText = next.match[0] ?? '';
    const end = start + matchedText.length - prefix.length;

    if (next.type === 'file') {
      const path = next.match[2] ?? '';
      return {
        start,
        end,
        render: () =>
          paragraph.append(
            $createFileMentionNode({ path, label: buildFileLabel(path) })
          ),
      };
    }

    if (next.type === 'thread') {
      const threadId = next.match[2] ?? '';
      const payload: ThreadMentionPayload = {
        threadId,
        label: threadId,
      };
      return {
        start,
        end,
        render: () => paragraph.append($createThreadMentionNode(payload)),
      };
    }

    const name = next.match[2] ?? '';
    const filePath = next.match[3] ?? '';
    const lineNumber = Number.parseInt(next.match[4] ?? '', 10);
    const lineValue = Number.isFinite(lineNumber) ? lineNumber : 1;

    return {
      start,
      end,
      render: () =>
        paragraph.append(
          $createSymbolMentionNode({
            name,
            filePath,
            line: lineValue,
          })
        ),
    };
  };

  while (cursor < line.length) {
    const mention = findNextMention();
    if (!mention) {
      break;
    }

    if (mention.start > cursor) {
      paragraph.append($createTextNode(line.slice(cursor, mention.start)));
    }

    mention.render();
    cursor = mention.end;
  }

  if (cursor < line.length) {
    paragraph.append($createTextNode(line.slice(cursor)));
  } else if (line.length === 0 && cursor === 0) {
    paragraph.append($createTextNode(''));
  }
};

export const updateRootText = (editor: LexicalEditor, text: string) => {
  editor.update(
    () => {
      const root = $getRoot();
      const current = root.getTextContent();
      if (current === text) {
        return;
      }

      root.clear();

      const lines = text.split('\n');
      const appendLine = (line: string) => {
        const paragraph = $createParagraphNode();
        appendTextWithMentions(paragraph, line);
        if (paragraph.getChildrenSize() === 0) {
          paragraph.append($createTextNode(''));
        }
        root.append(paragraph);
      };

      if (lines.length === 0) {
        appendLine('');
        return;
      }

      lines.forEach(appendLine);
    },
    { tag: 'skip-scroll-into-view' }
  );
};

export const getExpandedTextForSend = (
  editor: LexicalEditor | null,
  fallback: string
): string => {
  if (!editor) {
    return fallback;
  }

  return editor.getEditorState().read(() => {
    const root = $getRoot();
    const expandNode = (node: LexicalNode): string => {
      const mention = nodeToMention(node);
      if (mention) {
        return mentionToSendText(mention);
      }
      if ($isElementNode(node)) {
        return node
          .getChildren()
          .map((child) => expandNode(child))
          .join('');
      }
      return node.getTextContent();
    };

    const lines = root.getChildren().map((child) => expandNode(child));
    return lines.join('\n');
  });
};

export const insertMentionAtSelection = (
  editor: LexicalEditor,
  mention: AnyMention,
  anchor: { key: NodeKey; offset: number }
) => {
  editor.update(() => {
    const node = $getNodeByKey(anchor.key);
    if (!$isTextNode(node)) {
      return;
    }
    const selection = node.select(anchor.offset, anchor.offset);
    if (!selection) {
      return;
    }
    const mentionNode = createMentionNode(mention);
    if (!mentionNode) {
      return;
    }
    selection.insertNodes([mentionNode, $createTextNode(' ')]);
  });
};
