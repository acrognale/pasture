import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { parseUnifiedDiff } from '../diff';
import type { ParsedTurnDiffFile, ParsedTurnDiffLine } from '../types';
import { useFileHighlighting } from '../useFileHighlighting';
import { highlightLines } from '../useFileHighlighting';

const PYTHON_SAMPLE_LINES = [
  '#!/usr/bin/env python3',
  '',
  'import math',
  '',
  '',
  'def calculate_pi() -> float:',
  '    return math.pi',
  '',
  '',
  'def main() -> None:',
  '    pi_value = calculate_pi()',
  '    print(f"Pi is approximately {pi_value}")',
  '',
  '',
  'if __name__ == "__main__":',
  '    main()',
];

const buildFileWithLines = (
  lines: string[],
  fileId = 'file-0'
): ParsedTurnDiffFile => ({
  id: fileId,
  oldPath: 'test.py',
  newPath: 'test.py',
  displayPath: 'test.py',
  hunks: [
    {
      id: `${fileId}-h0`,
      header: '@@ -1,1 +1,1 @@',
      oldRange: null,
      newRange: null,
      lines: lines.map((text, index) => ({
        id: `${fileId}-h0-l${index}`,
        kind: 'context',
        text,
        oldNumber: index + 1,
        newNumber: index + 1,
        prefix: ' ',
      })),
    },
  ],
  language: 'python',
});

function HighlightHarness({ target }: { target: ParsedTurnDiffFile }) {
  const highlighting = useFileHighlighting(target);
  const nonMetadataLines: ParsedTurnDiffLine[] = [];
  for (const hunk of target.hunks) {
    for (const line of hunk.lines) {
      if (line.kind !== 'metadata') {
        nonMetadataLines.push(line);
      }
    }
  }

  return (
    <div>
      {nonMetadataLines.map((line) => {
        const tokens = highlighting.get(line.id);
        return (
          <div
            key={line.id}
            data-testid={line.id}
            data-token-count={tokens?.length ?? -1}
          >
            {tokens?.map((token, index) => (
              <span
                key={index}
                data-testid={`${line.id}-token-${index}`}
                data-color={token.color ?? 'none'}
              >
                {token.content}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}

describe('syntax highlighter', () => {
  it('returns highlighted tokens for non-empty Python lines', async () => {
    const highlighted = await highlightLines(PYTHON_SAMPLE_LINES, 'python');

    expect(highlighted).toHaveLength(PYTHON_SAMPLE_LINES.length);

    const indicesWithCode = [0, 2, 5, 6, 9, 10, 11, 14, 15];
    for (const index of indicesWithCode) {
      expect(highlighted[index]?.length ?? 0).toBeGreaterThan(0);
    }

    const blankIndices = PYTHON_SAMPLE_LINES.map((text, index) => ({
      index,
      text,
    }))
      .filter(({ text }) => text === '')
      .map(({ index }) => index);
    for (const index of blankIndices) {
      expect(highlighted[index]?.length ?? 0).toBe(0);
    }
  });

  it('highlights all non-metadata lines in a parsed Python diff', async () => {
    const diff = [
      'diff --git a/test.py b/test.py',
      '--- a/test.py',
      '+++ b/test.py',
      '@@ -1,14 +1,14 @@',
      ' #!/usr/bin/env python3',
      ' ',
      ' import math',
      ' ',
      ' ',
      ' def calculate_pi() -> float:',
      '     return math.pi',
      ' ',
      ' ',
      ' def main() -> None:',
      '     pi_value = calculate_pi()',
      '     print(f"Pi is approximately {pi_value}")',
      ' ',
      ' ',
      ' if __name__ == "__main__":',
      '     main()',
    ].join('\n');

    const { files } = parseUnifiedDiff(diff);
    const file = files[0];

    render(<HighlightHarness target={file} />);

    const targetLines = file.hunks
      .flatMap((hunk) => hunk.lines)
      .filter((line) => line.kind !== 'metadata' && line.text);

    await waitFor(() => {
      for (const line of targetLines) {
        const row = screen.getByTestId(line.id);
        const tokenCount = Number(row.dataset.tokenCount);
        expect(tokenCount).toBeGreaterThan(0);
        const coloredTokens = screen
          .getAllByTestId(new RegExp(`^${line.id}-token-`))
          .filter(
            (token) => token.dataset.color && token.dataset.color !== 'none'
          );
        expect(coloredTokens.length).toBeGreaterThan(0);
      }
    });
  });

  it('refreshes highlighting when the same file id receives new content', async () => {
    const initialFile = buildFileWithLines(['import math']);
    const updatedFile = buildFileWithLines([
      '#!/usr/bin/env python3',
      '',
      'import math',
      '',
      'return math.pi',
    ]);

    const { rerender } = render(<HighlightHarness target={initialFile} />);

    await waitFor(() => {
      const firstLine = screen.getByTestId(`${initialFile.id}-h0-l0`);
      expect(Number(firstLine.dataset.tokenCount)).toBeGreaterThan(0);
    });

    rerender(<HighlightHarness target={updatedFile} />);

    await waitFor(() => {
      const shebang = screen.getByTestId(`${updatedFile.id}-h0-l0`);
      const returnLine = screen.getByTestId(`${updatedFile.id}-h0-l4`);

      expect(Number(shebang.dataset.tokenCount)).toBeGreaterThan(0);
      expect(Number(returnLine.dataset.tokenCount)).toBeGreaterThan(0);
    });
  });
});
