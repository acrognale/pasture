import { useEffect, useRef, useState } from 'react';

/**
 * Hook to measure container width and provide breakpoint-based responsive behavior
 * @param ref - React ref to the container element to measure
 * @returns Current width in pixels, or null if not yet measured
 */
export function useContainerQuery<T extends HTMLElement = HTMLDivElement>(
  ref: React.RefObject<T>
): number | null {
  const [width, setWidth] = useState<number | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    // Set initial width
    const updateWidth = () => {
      const rect = element.getBoundingClientRect();
      setWidth(rect.width);
    };

    updateWidth();

    // Create ResizeObserver to watch for size changes
    observerRef.current = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = entry.contentRect.width;
        setWidth(newWidth);
      }
    });

    observerRef.current.observe(element);

    return () => {
      observerRef.current?.disconnect();
    };
  }, [ref]);

  return width;
}

/**
 * Breakpoint constants for responsive composer
 */
export const COMPOSER_BREAKPOINTS = {
  SMALL: 640, // Mobile - icon only
  MEDIUM: 768, // Tablet - model + settings
  LARGE: 1024, // Desktop - all controls
} as const;
