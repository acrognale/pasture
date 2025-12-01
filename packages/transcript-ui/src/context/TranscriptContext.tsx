import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';

import {
  copyToClipboard as defaultCopyToClipboard,
  formatTimestampClock,
} from '../lib/utils';
import type { TranscriptContext as TranscriptContextType } from '../types';

const TranscriptContext = createContext<TranscriptContextType | null>(null);

type TranscriptProviderProps = {
  children: ReactNode;
  copyToClipboard?: (text: string) => Promise<boolean>;
  formatTimestamp?: (timestamp: string) => string;
  workspacePath?: string;
};

/**
 * Provider for transcript context.
 * Supplies platform-specific functionality to transcript components.
 */
export function TranscriptProvider({
  children,
  copyToClipboard = defaultCopyToClipboard,
  formatTimestamp = formatTimestampClock,
  workspacePath,
}: TranscriptProviderProps) {
  const value = useMemo<TranscriptContextType>(
    () => ({
      copyToClipboard,
      formatTimestamp,
      workspacePath,
    }),
    [copyToClipboard, formatTimestamp, workspacePath]
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
      formatTimestamp: formatTimestampClock,
    };
  }

  return context;
}
