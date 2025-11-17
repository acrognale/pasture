import { useSpring } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

type UseStreamingTextOptions = {
  enabled?: boolean;
};

const SPRING_CONFIG = {
  stiffness: 450,
  damping: 38,
  mass: 0.7,
};

const toGraphemes = (value: string): string[] => {
  return Array.from(value ?? '');
};

export const useStreamingText = (
  text: string,
  options?: UseStreamingTextOptions
): string => {
  const enabled = options?.enabled ?? true;
  const [displayed, setDisplayed] = useState(text);
  const segmentsRef = useRef<string[]>(toGraphemes(text));
  const latestTextRef = useRef(text);
  const lengthSpring = useSpring(0, SPRING_CONFIG);

  useEffect(() => {
    const segments = toGraphemes(text);
    segmentsRef.current = segments;
    latestTextRef.current = text;

    if (enabled) {
      lengthSpring.set(segments.length);
    }
  }, [text, enabled, lengthSpring]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const unsubscribe = lengthSpring.on('change', (value) => {
      const segments = segmentsRef.current;
      const clampedLength = Math.max(
        0,
        Math.min(segments.length, Math.round(value))
      );

      if (clampedLength >= segments.length) {
        setDisplayed(latestTextRef.current);
        return;
      }

      const nextText = segments.slice(0, clampedLength).join('');
      setDisplayed(nextText);
    });

    return () => {
      unsubscribe();
    };
  }, [enabled, lengthSpring]);

  return enabled ? displayed : text;
};
