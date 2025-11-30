import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  type LexicalEditor,
  type LexicalNode,
} from 'lexical';

import {
  $createFileMentionNode,
  $isFileMentionNode,
  type FileMentionNode,
} from './components/FileMentionNode';
import {
  $createSymbolMentionNode,
  $isSymbolMentionNode,
  type SymbolMentionNode,
  formatSymbolLocation,
} from './components/SymbolMentionNode';

export const SLASH_TRIGGER: RegExp = /(^|\s)\/([a-z0-9-]*)$/i;
export const FILE_MENTION_TRIGGER: RegExp = /(^|\s)@([^\s@]*)$/;
export const FILE_MENTION_TEXT_PATTERN: RegExp = /(^|[\s])@([^\s@]*\/[^\s@]+)/g;
export const FILE_MENTION_INSERTION_PATTERN: RegExp = /(^|[\s\n])@[^\s@]*$/;
export const SYMBOL_MENTION_TRIGGER: RegExp = /(^|\s)#([^\s#]*)$/;
export const SYMBOL_MENTION_TEXT_PATTERN: RegExp =
  /(^|[\s])#([^\s#]+)\s+\(([^()]+):(\d+)\)/g;

export const buildFileLabel = (path: string): string => {
  const segments = path.split(/[\\/]/);
  const label = segments[segments.length - 1];
  return label || path;
};

export const isMentionNode = (
  node: unknown
): node is FileMentionNode | SymbolMentionNode =>
  $isFileMentionNode(node) || $isSymbolMentionNode(node);

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

    const fileMatch = FILE_MENTION_TEXT_PATTERN.exec(line);
    const symbolMatch = SYMBOL_MENTION_TEXT_PATTERN.exec(line);

    const candidates: Array<{
      match: RegExpExecArray;
      type: 'file' | 'symbol';
    }> = [];

    if (fileMatch) {
      candidates.push({ match: fileMatch, type: 'file' });
    }
    if (symbolMatch) {
      candidates.push({ match: symbolMatch, type: 'symbol' });
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
  editor.update(() => {
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
  });
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
      if ($isSymbolMentionNode(node)) {
        return `${node.getName()} (${formatSymbolLocation(
          node.getFilePath(),
          node.getLine()
        )})`;
      }
      if ($isFileMentionNode(node)) {
        return node.getTextContent();
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
