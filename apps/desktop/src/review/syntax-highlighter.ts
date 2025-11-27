import type { BundledLanguage, HighlighterGeneric } from 'shiki';

export type Token = {
  content: string;
  color: string | undefined;
};

const EXTENSION_TO_LANGUAGE: Record<string, BundledLanguage> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  cjs: 'javascript',
  mts: 'typescript',
  cts: 'typescript',
  json: 'json',
  jsonc: 'jsonc',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  vue: 'vue',
  svelte: 'svelte',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  rb: 'ruby',
  php: 'php',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'fish',
  sql: 'sql',
  md: 'markdown',
  mdx: 'mdx',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  svg: 'xml',
  graphql: 'graphql',
  gql: 'graphql',
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  lua: 'lua',
  r: 'r',
  scala: 'scala',
  clj: 'clojure',
  ex: 'elixir',
  exs: 'elixir',
  erl: 'erlang',
  hs: 'haskell',
  ml: 'ocaml',
  nim: 'nim',
  zig: 'zig',
  v: 'v',
  d: 'd',
  groovy: 'groovy',
  gradle: 'groovy',
  tf: 'hcl',
  hcl: 'hcl',
  prisma: 'prisma',
  astro: 'astro',
};

const FILENAME_TO_LANGUAGE: Record<string, BundledLanguage> = {
  Dockerfile: 'dockerfile',
  Makefile: 'makefile',
  Gemfile: 'ruby',
  Rakefile: 'ruby',
  Vagrantfile: 'ruby',
  Podfile: 'ruby',
  Fastfile: 'ruby',
  Brewfile: 'ruby',
  Procfile: 'yaml',
  '.editorconfig': 'ini',
  'package.json': 'json',
  'tsconfig.json': 'jsonc',
  'jsconfig.json': 'jsonc',
};

export type HighlightedLine = Token[];

export const detectLanguage = (filePath: string): string => {
  const filename = filePath.split('/').pop() ?? '';

  if (FILENAME_TO_LANGUAGE[filename]) {
    return FILENAME_TO_LANGUAGE[filename];
  }

  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext && EXTENSION_TO_LANGUAGE[ext]) {
    return EXTENSION_TO_LANGUAGE[ext];
  }

  return 'text';
};

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

export const getHighlighter = async (): Promise<ShikiHighlighter> => {
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
