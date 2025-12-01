import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Extended tailwind-merge with transcript-specific theme tokens
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      leading: ['transcript', 'transcript-code', 'transcript-tight'],
      text: ['transcript-base', 'transcript-code', 'transcript-micro'],
      font: ['transcript', 'transcript-code'],
    },
  },
});

/**
 * Merge class names with tailwind-merge support
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Safely stringify a value for display
 */
export function safeStringify(value: unknown): string {
  const normalizeJsonValue = (input: unknown): unknown =>
    typeof input === 'bigint' ? input.toString() : input;

  try {
    return JSON.stringify(value, (_key: string, current: unknown) =>
      normalizeJsonValue(current)
    );
  } catch {
    return typeof value === 'string' ? value : '[unserializable]';
  }
}

/**
 * Converts an absolute file path to a path relative to the workspace root.
 * Returns the original path when it cannot be made relative.
 */
export function makePathRelative(
  workspacePath: string,
  filePath: string
): string {
  if (!workspacePath || !filePath) {
    return filePath;
  }

  const normalizedWorkspace = workspacePath.replace(/\/$/, '');
  const normalizedPath = filePath.replace(/\/$/, '');

  if (normalizedPath.startsWith(normalizedWorkspace)) {
    const relative = normalizedPath.slice(normalizedWorkspace.length);
    return relative.startsWith('/') ? relative.slice(1) : relative;
  }

  return filePath;
}

/**
 * Format a timestamp to a clock time string (HH:MM:SS)
 */
export function formatTimestampClock(timestamp: string | undefined): string {
  if (!timestamp) {
    return '';
  }
  try {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '';
  }
}

/**
 * Default clipboard copy function using navigator.clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('Failed to copy to clipboard', error);
    return false;
  }
}

/**
 * Split a string into lines, handling various line ending styles
 */
export function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}
