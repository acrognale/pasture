import { describe, expect, it } from 'vitest';
import type { MessageAttachment } from '~/conversation/types';

import { buildInputItems } from '../useSendMessage';

describe('buildInputItems', () => {
  it('builds a text-only payload', () => {
    const result = buildInputItems(' hello ', []);
    expect(result).toEqual([{ type: 'text', data: { text: 'hello' } }]);
  });

  it('builds an image-only payload', () => {
    const attachments: MessageAttachment[] = [
      { type: 'localImage', path: '/tmp/image.png', width: 120, height: 80 },
    ];
    const result = buildInputItems('   ', attachments);
    expect(result).toEqual([
      { type: 'localImage', data: { path: '/tmp/image.png' } },
    ]);
  });

  it('builds a combined payload with text and images', () => {
    const attachments: MessageAttachment[] = [
      { type: 'localImage', path: '/tmp/image.png' },
      { type: 'image', imageUrl: 'https://example.com/cat.png' },
    ];
    const result = buildInputItems('Message', attachments);
    expect(result).toEqual([
      { type: 'text', data: { text: 'Message' } },
      { type: 'localImage', data: { path: '/tmp/image.png' } },
      { type: 'image', data: { image_url: 'https://example.com/cat.png' } },
    ]);
  });

  it('drops attachments without usable data', () => {
    const attachments: MessageAttachment[] = [
      { type: 'localImage', path: '   ' },
      { type: 'image', imageUrl: '' },
    ];
    const result = buildInputItems('', attachments);
    expect(result).toEqual([]);
  });
});
