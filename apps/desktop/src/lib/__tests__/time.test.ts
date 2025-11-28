import { describe, expect, test } from 'vitest';

import { formatSessionPreviewTimestamp } from '../time';

describe('formatSessionPreviewTimestamp', () => {
  test('uses clock time for same-day timestamps and dates for previous days', () => {
    const now = new Date('2024-11-28T12:00:00Z');
    const sameDay = new Date('2024-11-28T09:15:00Z');
    const previousDay = new Date('2024-11-27T23:00:00Z');

    expect(formatSessionPreviewTimestamp(sameDay.toISOString(), now)).toBe(
      new Intl.DateTimeFormat(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      }).format(sameDay)
    );

    expect(formatSessionPreviewTimestamp(previousDay.toISOString(), now)).toBe(
      new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
      }).format(previousDay)
    );
  });
});
