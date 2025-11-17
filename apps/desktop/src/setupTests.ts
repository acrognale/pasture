import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import {
  installTestingEnvironment,
  resetTestingEnvironment,
} from '~/testing/codex';

installTestingEnvironment();

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    message: vi.fn(),
    success: vi.fn(),
  },
  Toaster: () => null,
}));

afterEach(() => {
  cleanup();
  resetTestingEnvironment();
});

if (typeof window !== 'undefined') {
  if (!Element.prototype.scrollTo) {
    Object.defineProperty(Element.prototype, 'scrollTo', {
      value: (): void => undefined,
      writable: true,
    });
  }
  Object.defineProperty(window, 'scrollTo', {
    value: () => undefined,
    writable: true,
    configurable: true,
  });
}

if (
  typeof window !== 'undefined' &&
  typeof window.ResizeObserver === 'undefined'
) {
  const createContentRect = (target: Element): DOMRectReadOnly => {
    const width =
      target instanceof HTMLElement && target.clientWidth > 0
        ? target.clientWidth
        : 1024;
    const height =
      target instanceof HTMLElement && target.clientHeight > 0
        ? target.clientHeight
        : 768;

    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: height,
      right: width,
      width,
      height,
      toJSON: () => ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: height,
        right: width,
        width,
        height,
      }),
    };
  };

  class ResizeObserverPolyfill implements ResizeObserver {
    callback: ResizeObserverCallback;
    elements = new Set<Element>();

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }

    observe(target: Element): void {
      this.elements.add(target);
      this.callback(
        [
          {
            target,
            contentRect: createContentRect(target),
            borderBoxSize: [],
            contentBoxSize: [],
            devicePixelContentBoxSize: [],
          },
        ],
        this
      );
    }

    unobserve(target: Element): void {
      this.elements.delete(target);
    }

    disconnect(): void {
      this.elements.clear();
    }
  }

  Object.defineProperty(window, 'ResizeObserver', {
    value: ResizeObserverPolyfill,
    configurable: true,
    writable: true,
  });
}

if (
  typeof window !== 'undefined' &&
  typeof window.IntersectionObserver === 'undefined'
) {
  type IOEntry = IntersectionObserverEntry;

  const createObserverEntry = (
    target: Element,
    isIntersecting: boolean
  ): IOEntry => {
    const rect = target.getBoundingClientRect?.() ?? new DOMRect(0, 0, 0, 0);
    return {
      time: Date.now(),
      target,
      isIntersecting,
      intersectionRatio: isIntersecting ? 1 : 0,
      boundingClientRect: rect,
      intersectionRect: rect,
      rootBounds: null,
    };
  };

  class IntersectionObserverPolyfill implements IntersectionObserver {
    callback: IntersectionObserverCallback;
    root: Element | Document | null;
    rootMargin: string;
    thresholds: ReadonlyArray<number>;
    elements = new Set<Element>();

    constructor(
      callback: IntersectionObserverCallback,
      options?: IntersectionObserverInit
    ) {
      this.callback = callback;
      this.root = options?.root ?? null;
      this.rootMargin = options?.rootMargin ?? '0px';
      const threshold = options?.threshold ?? 0;
      this.thresholds = Array.isArray(threshold) ? threshold : [threshold];
    }

    observe(target: Element): void {
      this.elements.add(target);
      this.callback([createObserverEntry(target, true)], this);
    }

    unobserve(target: Element): void {
      this.elements.delete(target);
    }

    disconnect(): void {
      this.elements.clear();
    }

    takeRecords(): IOEntry[] {
      return [];
    }
  }

  Object.defineProperty(window, 'IntersectionObserver', {
    value: IntersectionObserverPolyfill,
    configurable: true,
    writable: true,
  });
}

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
    writable: true,
  });
}
