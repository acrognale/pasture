import 'highlight.js/styles/github.css';
import type { Components } from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkBreaks from 'remark-breaks';
import remarkDirective from 'remark-directive';
import remarkGfm from 'remark-gfm';
import { Streamdown } from 'streamdown';
import { cn } from '~/lib/utils';

import { CopyButton } from './CopyButton';

type MarkdownProps = {
  children: string;
  className?: string;
  streaming?: boolean;
};

function CodeBlock({ children }: { children: React.ReactNode }) {
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  const code = String(children ?? '').replace(/\n$/, '');

  return (
    <div className="group relative my-2">
      <pre className="overflow-x-auto rounded-lg bg-muted p-4">
        <code className="font-mono text-sm bg-transparent!">{children}</code>
      </pre>
      <CopyButton
        content={code}
        label="Copy code"
        className="absolute right-2 top-2"
      />
    </div>
  );
}

const markdownComponents: Components = {
  code({
    inline,
    className,
    children,
    ...props
  }: {
    inline: boolean;
    className: string;
    children: React.ReactNode;
    props: React.HTMLAttributes<HTMLElement>;
  }) {
    // Inline code: explicitly marked inline, OR no language className
    const isInline = inline ?? !className;

    if (isInline) {
      return (
        <code
          className="rounded bg-muted px-1.5 py-0.5 text-[0.9em] font-mono"
          {...props}
        >
          {children}
        </code>
      );
    }

    return <CodeBlock>{children}</CodeBlock>;
  },

  pre({ children }) {
    // Don't wrap code blocks in extra <pre> tags
    return <>{children}</>;
  },

  p({ children }) {
    return <p className="mb-1.5">{children}</p>;
  },

  ul({ children }) {
    return <ul className="mb-2 ml-4 list-disc space-y-1">{children}</ul>;
  },

  ol({ children }) {
    return <ol className="mb-2 ml-4 list-decimal space-y-1">{children}</ol>;
  },

  li({ children }) {
    return <li className="leading-normal">{children}</li>;
  },

  h1({ children }) {
    return (
      <h1 className="mb-2 mt-4 text-[length:var(--text-markdown-h1)] font-medium leading-tight">
        {children}
      </h1>
    );
  },

  h2({ children }) {
    return (
      <h2 className="mb-2 mt-3 text-[length:var(--text-markdown-h2)] font-medium leading-tight">
        {children}
      </h2>
    );
  },

  h3({ children }) {
    return (
      <h3 className="mb-1 mt-2 text-[length:var(--text-markdown-h3)] font-medium leading-snug">
        {children}
      </h3>
    );
  },

  h4({ children }) {
    return (
      <h4 className="mb-1 mt-2 text-[length:var(--text-markdown-h4)] font-medium leading-snug">
        {children}
      </h4>
    );
  },

  h5({ children }) {
    return (
      <h5 className="mb-1 mt-2 text-[length:var(--text-markdown-h5)] font-medium leading-snug">
        {children}
      </h5>
    );
  },

  h6({ children }) {
    return (
      <h6 className="mb-1 mt-2 text-[length:var(--text-markdown-h6)] font-medium leading-snug">
        {children}
      </h6>
    );
  },

  blockquote({ children }) {
    return (
      <blockquote className="my-2 border-l-2 border-muted-foreground/30 pl-4 italic text-muted-foreground">
        {children}
      </blockquote>
    );
  },

  a({ href, children }) {
    return (
      <a
        href={href}
        className="text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary/60"
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    );
  },

  hr() {
    return <hr className="my-2 border-border" />;
  },

  table({ children }) {
    return (
      <div className="my-2 overflow-x-auto">
        <table className="min-w-full border-collapse">{children}</table>
      </div>
    );
  },

  thead({ children }) {
    return <thead className="border-b border-border">{children}</thead>;
  },

  tbody({ children }) {
    return <tbody className="divide-y divide-border">{children}</tbody>;
  },

  tr({ children }) {
    return <tr>{children}</tr>;
  },

  th({ children }) {
    return (
      <th className="px-3 py-2 text-left text-sm font-medium">{children}</th>
    );
  },

  td({ children }) {
    return <td className="px-3 py-2 text-sm">{children}</td>;
  },

  strong({ children }) {
    return <strong className="font-semibold">{children}</strong>;
  },

  em({ children }) {
    return <em className="italic">{children}</em>;
  },

  del({ children }) {
    return <del className="line-through opacity-70">{children}</del>;
  },
};

export function Markdown({
  children,
  className,
  streaming = false,
}: MarkdownProps) {
  // Skip expensive syntax highlighting during streaming to prevent freezing
  const rehypePlugins = streaming ? [] : [rehypeHighlight];

  return (
    <div className={cn('font-transcript leading-transcript', className)}>
      <Streamdown
        className="font-transcript leading-transcript"
        components={markdownComponents}
        remarkPlugins={[remarkGfm, remarkBreaks, remarkDirective]}
        rehypePlugins={rehypePlugins}
      >
        {children}
      </Streamdown>
    </div>
  );
}
