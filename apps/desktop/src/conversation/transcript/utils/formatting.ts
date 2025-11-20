import type {
  TranscriptAgentMessageContent,
  TranscriptUserInput,
} from '../types';

const joinSegments = (segments: string[]): string =>
  segments.length === 0
    ? ''
    : segments.filter((segment) => segment.length > 0).join('\n\n');

export const formatUserMessageContent = (inputs: TranscriptUserInput[]) => {
  const textSegments: string[] = [];
  const images: string[] = [];

  inputs.forEach((input) => {
    switch (input.type) {
      case 'text':
        textSegments.push(input.text);
        break;
      case 'image':
        images.push(input.image_url);
        break;
      case 'local_image':
        images.push(input.path);
        break;
      default:
        break;
    }
  });

  return {
    message: joinSegments(textSegments),
    images: images.length > 0 ? images : null,
  };
};

export const formatAgentMessageContent = (
  content: TranscriptAgentMessageContent[]
): string =>
  joinSegments(
    content
      .map((entry) => (entry.type === 'Text' ? entry.text : ''))
      .filter((segment) => segment.length > 0)
  );

export const appendUnique = <T>(values: T[], value: T): T[] =>
  values.includes(value) ? values : [...values, value];

export { joinSegments };
