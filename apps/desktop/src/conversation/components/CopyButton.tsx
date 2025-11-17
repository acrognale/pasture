import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '~/components/ui/button';
import { cn, copyToClipboard } from '~/lib/utils';

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
  showToast = false,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!content) {
      return;
    }

    const success = await copyToClipboard(content);

    if (showToast) {
      if (success) {
        toast.success('Copied to clipboard');
      } else {
        toast.error('Failed to copy to clipboard');
      }
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => {
        void handleCopy();
      }}
      className={cn(
        'h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity',
        className
      )}
      title={label}
    >
      {copied ? (
        <Check className="size-3 text-green-600" />
      ) : (
        <Copy className="size-3" />
      )}
    </Button>
  );
}
