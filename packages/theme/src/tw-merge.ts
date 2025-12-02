import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      leading: ['transcript', 'transcript-code', 'transcript-tight'],
      text: [
        'transcript-base',
        'transcript-code',
        'transcript-micro',
        'transcript-markdown-h1',
        'transcript-markdown-h2',
        'transcript-markdown-h3',
        'transcript-markdown-h4',
        'transcript-markdown-h5',
        'transcript-markdown-h6',
      ],
      font: ['transcript', 'transcript-code', 'transcript-sans', 'transcript-mono'],
      radius: ['transcript', 'transcript-sm', 'transcript-md', 'transcript-lg'],
      color: [
        // Brand
        'brand',
        'brand-foreground',
        'brand-soft',
        'brand-muted',
        'brand-cream',
        // Transcript
        'transcript-background',
        'transcript-foreground',
        'transcript-muted',
        'transcript-muted-foreground',
        'transcript-border',
        'transcript-info',
        'transcript-info-foreground',
        'transcript-success',
        'transcript-success-foreground',
        'transcript-warning',
        'transcript-warning-foreground',
        'transcript-error',
        'transcript-error-foreground',
        'transcript-tool-primary',
        'transcript-tool-primary-foreground',
        'transcript-tool-secondary',
        'transcript-tool-secondary-foreground',
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export { twMerge };
