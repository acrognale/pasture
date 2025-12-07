import { cn } from '@pasture/theme';
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
  const wrapperClass = cn(
    'font-transcript leading-transcript break-words',
    className
  );

  return (
    <div className={wrapperClass}>
      <Streamdown
        mode={streaming ? 'streaming' : 'static'}
        isAnimating={streaming}
        className="font-transcript leading-transcript"
      >
        {children}
      </Streamdown>
    </div>
  );
}
