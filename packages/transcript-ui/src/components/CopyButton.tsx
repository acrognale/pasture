import { useState } from 'react';

import { useTranscriptContext } from '../context/TranscriptContext';
import { cn } from '../lib/utils';

type CopyButtonProps = {
  content: string;
  className?: string;
  label?: string;
  showToast?: boolean;
};

export function CopyButton({
  content,
  className,
  label = 'Copy',
  showToast: shouldShowToast = false,
}: CopyButtonProps) {
  const { copyToClipboard, showToast } = useTranscriptContext();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!content || !copyToClipboard) {
      return;
    }

    const success = await copyToClipboard(content);

    if (shouldShowToast && showToast) {
      if (success) {
        showToast('Copied to clipboard', 'success');
      } else {
        showToast('Failed to copy to clipboard', 'error');
      }
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={() => {
        void handleCopy();
      }}
      className={cn(
        'h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground',
        className
      )}
      title={label}
    >
      {copied ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-success-foreground"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
        </svg>
      )}
    </button>
  );
}
