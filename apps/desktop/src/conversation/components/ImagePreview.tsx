import { convertFileSrc } from '@tauri-apps/api/core';
import { useMemo, useState } from 'react';

type ImagePreviewProps = {
  path: string;
  alt?: string;
};

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value.trim());

const toImageSrc = (path: string): string => {
  const trimmed = path.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith('data:')) {
    return trimmed;
  }

  if (isHttpUrl(trimmed)) {
    return trimmed;
  }

  try {
    return convertFileSrc(trimmed);
  } catch {
    return trimmed;
  }
};

const fileNameFromPath = (path: string): string => {
  const trimmed = path.trim();
  if (!trimmed) {
    return 'image';
  }
  const segments = trimmed.split(/[/\\]/);
  const last = segments[segments.length - 1];
  return last || 'image';
};

export function ImagePreview({ path, alt }: ImagePreviewProps) {
  const [open, setOpen] = useState(false);
  const src = useMemo(() => toImageSrc(path), [path]);

  if (!path.trim()) {
    return null;
  }

  const label = alt ?? fileNameFromPath(path);

  return (
    <>
      <button
        type="button"
        className="group relative h-20 w-20 rounded-md overflow-hidden border border-border bg-muted/60 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
        onClick={() => setOpen(true)}
        aria-label={label}
      >
        {src ? (
          <img
            src={src}
            alt={label}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            image
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-w-[90vw] max-h-[90vh] rounded-lg border border-border bg-background shadow-lg overflow-hidden"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            {src ? (
              <img
                src={src}
                alt={label}
                className="max-h-[90vh] max-w-[90vw] object-contain"
              />
            ) : (
              <div className="p-4 text-sm text-muted-foreground">
                Unable to load image.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
