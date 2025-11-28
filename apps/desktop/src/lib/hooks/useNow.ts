import { useEffect, useState } from 'react';

const DEFAULT_INTERVAL_MS = 60_000;

export function useNow(intervalMs: number = DEFAULT_INTERVAL_MS): Date {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(new Date());
    }, intervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [intervalMs]);

  return now;
}
