/**
 * Utility function to split text into lines, normalizing line endings.
 * Used by execution, patch, and tool transcript cells when rendering output.
 */
export const splitLines = (value: string): string[] =>
  value.replace(/\r\n/g, '\n').split('\n');
