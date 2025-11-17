const clampElapsed = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
};

export const formatElapsedCompact = (elapsedSeconds: number): string => {
  const totalSeconds = clampElapsed(elapsedSeconds);

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  if (totalSeconds < 3600) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${minutes.toString().padStart(2, '0')}m ${seconds
    .toString()
    .padStart(2, '0')}s`;
};

const timestampClockFormatter = new Intl.DateTimeFormat('en-US', {
  hour12: false,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const previewTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});

const previewDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
});

const parseTimestamp = (value?: string | null): Date | null => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(Number(date)) ? null : date;
};

const isSameDay = (left: Date, right: Date): boolean =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

export const formatTimestampClock = (value?: string | null): string => {
  const date = parseTimestamp(value);
  if (!date) {
    return '';
  }

  return timestampClockFormatter.format(date);
};

export const formatSessionPreviewTimestamp = (
  value?: string | null
): string => {
  const date = parseTimestamp(value);
  if (!date) {
    return '';
  }

  const now = new Date();
  return isSameDay(date, now)
    ? previewTimeFormatter.format(date)
    : previewDateFormatter.format(date);
};
