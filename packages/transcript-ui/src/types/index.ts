export * from './transcript';

/**
 * Context for transcript components - provides platform-specific functionality.
 */
export type TranscriptContext = {
  /**
   * Copy text to clipboard. Returns true on success.
   */
  copyToClipboard?: (text: string) => Promise<boolean>;

  /**
   * Workspace path for making file paths relative.
   */
  workspacePath?: string;

  /**
   * Convert a file path to an image source URL.
   * Platform-specific: Tauri uses asset protocol, web might use different approach.
   */
  convertImageSrc?: (path: string) => string;

  /**
   * Show a toast notification to the user.
   */
  showToast?: (message: string, type: 'success' | 'error') => void;
};
