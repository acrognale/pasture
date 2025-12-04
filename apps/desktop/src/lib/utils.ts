import { cn as themeCn } from '@pasture/theme';
import { writeText as tauriWriteText } from '@tauri-apps/plugin-clipboard-manager';
import { type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]): string {
  return themeCn(...inputs);
}

const normalizeJsonValue = (input: unknown): unknown =>
  typeof input === 'bigint' ? input.toString() : input;

export function safeStringify(value: unknown): string {
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

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await tauriWriteText(text);
    return true;
  } catch (error) {
    console.error('Failed to copy to clipboard', error);
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('Failed to copy to clipboard via navigator', error);
    return false;
  }
}
