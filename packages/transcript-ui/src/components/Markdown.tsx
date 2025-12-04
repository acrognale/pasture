import { cn } from '@pasture/theme';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { Streamdown } from 'streamdown';

type MarkdownProps = {
  children: string;
  className?: string;
  streaming?: boolean;
};

export function Markdown({
  children,
  className,
  streaming = false,
}: MarkdownProps) {
  const wrapperClass = cn('font-transcript leading-transcript', className);

  // Use Streamdown for streaming content (client-side animation)
  // Use react-markdown for static content (SSR-friendly, no JS chunks needed)
  if (streaming) {
    return (
      <div className={wrapperClass}>
        <Streamdown
          isAnimating={streaming}
          className="font-transcript leading-transcript"
        >
          {children}
        </Streamdown>
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeHighlight]}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
