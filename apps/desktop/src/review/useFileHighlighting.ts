import { useEffect, useRef, useState } from 'react';
import type { BundledLanguage, HighlighterGeneric } from 'shiki';

import type { ParsedTurnDiffFile } from './types';

// Types

export type Token = {
  content: string;
  color: string | undefined;
};

export type HighlightedLine = Token[];

export type FileHighlighting = Map<string, HighlightedLine>;

// Shiki highlighter singleton

type ShikiHighlighter = HighlighterGeneric<BundledLanguage, string>;

let highlighterPromise: Promise<ShikiHighlighter> | null = null;

const PRELOADED_LANGUAGES: BundledLanguage[] = [
  'typescript',
  'tsx',
  'javascript',
  'jsx',
  'json',
  'jsonc',
  'css',
  'html',
  'markdown',
  'yaml',
  'bash',
  'python',
  'rust',
  'go',
];

const THEME = 'github-light';

const getHighlighter = async (): Promise<ShikiHighlighter> => {
  if (!highlighterPromise) {
    console.log('[shiki] Initializing highlighter...');
    highlighterPromise = import('shiki')
      .then(({ createHighlighter }) => {
        console.log('[shiki] Creating highlighter with theme:', THEME);
        return createHighlighter({
          themes: [THEME],
          langs: PRELOADED_LANGUAGES,
        });
      })
      .then((highlighter) => {
        console.log('[shiki] Highlighter ready');
        return highlighter;
      })
      .catch((err) => {
        console.error('[shiki] Failed to create highlighter:', err);
        throw err;
      });
  }
  return highlighterPromise;
};

const loadedLanguages = new Set<string>(PRELOADED_LANGUAGES);

const toTokens = (
  themedTokens: { content: string; color?: string }[]
): Token[] => themedTokens.map((t) => ({ content: t.content, color: t.color }));

const highlightSingleLine = (
  highlighter: ShikiHighlighter,
  lang: BundledLanguage,
  text: string
): HighlightedLine => {
  if (!text) {
    return [];
  }

  try {
    const tokens = highlighter.codeToTokensBase(text, {
      lang,
      theme: THEME,
    });
    const lineTokens = tokens[0];
    if (lineTokens?.length) {
      return toTokens(lineTokens);
    }
  } catch {
    // Fall through to plain text
  }

  return [{ content: text, color: undefined }];
};

export const highlightLine = async (
  text: string,
  language: string
): Promise<HighlightedLine> => {
  if (!text || language === 'text') {
    return text ? [{ content: text, color: undefined }] : [];
  }

  const highlighter = await getHighlighter();
  const lang = language as BundledLanguage;

  if (!loadedLanguages.has(language)) {
    try {
      await highlighter.loadLanguage(lang);
      loadedLanguages.add(language);
    } catch {
      return [{ content: text, color: undefined }];
    }
  }

  try {
    const tokens = highlighter.codeToTokensBase(text, {
      lang,
      theme: THEME,
    });
    const line = tokens[0];
    return line ? toTokens(line) : highlightSingleLine(highlighter, lang, text);
  } catch {
    return highlightSingleLine(highlighter, lang, text);
  }
};

export const highlightLines = async (
  lines: string[],
  language: string
): Promise<HighlightedLine[]> => {
  if (!lines.length || language === 'text') {
    return lines.map((text) => [{ content: text, color: undefined }]);
  }

  const highlighter = await getHighlighter();
  const lang = language as BundledLanguage;

  if (!loadedLanguages.has(language)) {
    try {
      await highlighter.loadLanguage(lang);
      loadedLanguages.add(language);
    } catch {
      return lines.map((text) => [{ content: text, color: undefined }]);
    }
  }

  try {
    const code = lines.join('\n');
    const tokens = highlighter.codeToTokensBase(code, {
      lang,
      theme: THEME,
    });
    return lines.map((text, index) => {
      const lineTokens = tokens[index];
      if (lineTokens?.length) {
        return toTokens(lineTokens);
      }
      return highlightSingleLine(highlighter, lang, text);
    });
  } catch {
    return lines.map((text) =>
      text ? [{ content: text, color: undefined }] : []
    );
  }
};

// Hook

export const useFileHighlighting = (
  file: ParsedTurnDiffFile
): FileHighlighting => {
  const [highlighting, setHighlighting] = useState<FileHighlighting>(new Map());
  const requestCounter = useRef(0);

  useEffect(() => {
    const requestId = requestCounter.current + 1;
    requestCounter.current = requestId;

    const lines: string[] = [];
    const lineIds: string[] = [];

    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (line.kind !== 'metadata') {
          lines.push(line.text);
          lineIds.push(line.id);
        }
      }
    }

    highlightLines(lines, file.language)
      .then((highlighted) => {
        // Check if we're still on the latest request for this file
        if (requestCounter.current !== requestId) {
          return;
        }
        const map = new Map<string, HighlightedLine>();
        for (let i = 0; i < lineIds.length; i++) {
          const tokens = highlighted[i];
          if (tokens) {
            map.set(lineIds[i], tokens);
          }
        }
        setHighlighting(map);
      })
      .catch((err) => {
        console.error('[syntax] Error highlighting', file.displayPath, err);
      });
  }, [file.id, file.displayPath, file.language, file.hunks]);

  return highlighting;
};
