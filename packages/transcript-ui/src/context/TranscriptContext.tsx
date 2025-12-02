import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';

import { copyToClipboard as defaultCopyToClipboard } from '../lib/utils';
import type { TranscriptContext as TranscriptContextType } from '../types';

const TranscriptContext = createContext<TranscriptContextType | null>(null);

/**
 * Default image source converter - returns the path as-is.
 * Platforms can override to use asset protocols (e.g., Tauri's convertFileSrc).
 */
const defaultConvertImageSrc = (path: string): string => path;

/**
 * Default toast implementation - logs to console.
 * Platforms can override with their own notification system.
 */
const defaultShowToast = (message: string, type: 'success' | 'error'): void => {
  if (type === 'error') {
    console.error(message);
  } else {
    console.log(message);
  }
};

type TranscriptProviderProps = {
  children: ReactNode;
  copyToClipboard?: (text: string) => Promise<boolean>;
  workspacePath?: string;
  convertImageSrc?: (path: string) => string;
  showToast?: (message: string, type: 'success' | 'error') => void;
};

/**
 * Provider for transcript context.
 * Supplies platform-specific functionality to transcript components.
 */
export function TranscriptProvider({
  children,
  copyToClipboard = defaultCopyToClipboard,
  workspacePath,
  convertImageSrc = defaultConvertImageSrc,
  showToast = defaultShowToast,
}: TranscriptProviderProps) {
  const value = useMemo<TranscriptContextType>(
    () => ({
      copyToClipboard,
      workspacePath,
      convertImageSrc,
      showToast,
    }),
    [copyToClipboard, workspacePath, convertImageSrc, showToast]
  );

  return (
    <TranscriptContext.Provider value={value}>
      {children}
    </TranscriptContext.Provider>
  );
}

/**
 * Hook to access transcript context.
 * Returns default implementations if no provider is present.
 */
export function useTranscriptContext(): TranscriptContextType {
  const context = useContext(TranscriptContext);

  // Return defaults if no provider (allows components to work standalone)
  if (!context) {
    return {
      copyToClipboard: defaultCopyToClipboard,
      convertImageSrc: defaultConvertImageSrc,
      showToast: defaultShowToast,
    };
  }

  return context;
}
