import { extractFirstBold } from '~/lib/markdown';

import type {
  TranscriptReasoningItem,
  TranscriptReasoningSummaryFormat,
} from '../types';
import { joinSegments } from './formatting';

export const hasReasoningBody = (text: string): boolean => {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return false;
  }

  if (!trimmed.startsWith('**')) {
    return true;
  }

  const afterOpen = trimmed.slice(2);
  const closing = afterOpen.indexOf('**');
  if (closing === -1) {
    return true;
  }

  const afterClose = afterOpen.slice(closing + 2).trim();
  return afterClose.length > 0;
};

export const stripReasoningHeader = (text: string): string => {
  const trimmed = text.trim();
  if (!trimmed.startsWith('**')) {
    return text;
  }

  const afterOpen = trimmed.slice(2);
  const closing = afterOpen.indexOf('**');
  if (closing === -1) {
    return text;
  }

  const header = afterOpen.slice(0, closing).trim();
  if (header.length === 0) {
    return text;
  }

  const afterClose = afterOpen.slice(closing + 2);
  const bodyContent = afterClose.trim();
  return bodyContent.length === 0 ? '' : bodyContent;
};

export const formatReasoningText = (
  item: TranscriptReasoningItem,
  pending: string | null
): { text: string; header: string | null; hasBody: boolean } => {
  const segments: string[] = [];

  if (item.summary_text.length > 0) {
    segments.push(item.summary_text.join('\n'));
  }

  if (item.raw_content.length > 0) {
    segments.push(item.raw_content.join('\n'));
  }

  if (pending && pending.trim().length > 0) {
    segments.push(pending);
  }

  const combined = joinSegments(segments);
  const header = extractFirstBold(combined);
  const sanitized = stripReasoningHeader(combined);
  const hasBody = hasReasoningBody(sanitized);
  return { text: hasBody ? sanitized : '', header, hasBody };
};

export const extractReasoningHeader = (text: string): string | null =>
  extractFirstBold(text);

export const deriveReasoningSummaryFormat = (
  model: string | null | undefined
): TranscriptReasoningSummaryFormat => {
  if (!model) {
    return 'none';
  }

  const normalized = model.toLowerCase();

  if (
    normalized.startsWith('test-gpt-5-codex') ||
    normalized.startsWith('codex-') ||
    normalized.startsWith('gpt-5-codex')
  ) {
    return 'experimental';
  }

  return 'none';
};

export const isExperimentalReasoningFormat = (
  format: TranscriptReasoningSummaryFormat
): boolean => format === 'experimental';
