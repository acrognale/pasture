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
  if (typeof navigator === 'undefined') {
    console.warn('[copyToClipboard] navigator is unavailable');
    return false;
  }

  const clipboard = navigator.clipboard;
  if (!clipboard || typeof clipboard.writeText !== 'function') {
    console.warn('[copyToClipboard] clipboard API is not available');
    return false;
  }

  try {
    await clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('[copyToClipboard] Failed to copy to clipboard', error);
    return false;
  }
}

/**
 * Split a string into lines, handling various line ending styles
 */
export function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

/**
 * Clamp elapsed time to a non-negative integer
 */
const clampElapsed = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
};

/**
 * Format elapsed seconds into a compact human-readable string
 */
export function formatElapsedCompact(elapsedSeconds: number): string {
  const totalSeconds = clampElapsed(elapsedSeconds);

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  if (totalSeconds < 3600) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${minutes.toString().padStart(2, '0')}m ${seconds
    .toString()
    .padStart(2, '0')}s`;
}
