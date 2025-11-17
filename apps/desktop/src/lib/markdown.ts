export const extractFirstBold = (text: string): string | null => {
  if (!text) {
    return null;
  }

  const length = text.length;
  for (let index = 0; index + 1 < length; index += 1) {
    if (text[index] === '*' && text[index + 1] === '*') {
      const start = index + 2;
      let cursor = start;

      while (cursor + 1 < length) {
        if (text[cursor] === '*' && text[cursor + 1] === '*') {
          const inner = text.slice(start, cursor).trim();
          return inner.length > 0 ? inner : null;
        }

        cursor += 1;
      }

      return null;
    }
  }

  return null;
};
