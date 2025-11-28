import type { HighlightedLine } from '../useFileHighlighting';

type HighlightedCodeProps = {
  text: string;
  tokens: HighlightedLine | undefined;
};

export function HighlightedCode({ text, tokens }: HighlightedCodeProps) {
  if (!tokens || tokens.length === 0) {
    return <>{text}</>;
  }

  return (
    <>
      {tokens.map((token, index) => {
        // Strip any newlines from tokens - they shouldn't be there but just in case
        const content = token.content.replace(/\n/g, '');
        if (!content) return null;
        return (
          <span
            key={index}
            style={token.color ? { color: token.color } : undefined}
          >
            {content}
          </span>
        );
      })}
    </>
  );
}
