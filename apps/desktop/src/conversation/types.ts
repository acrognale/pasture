export type LocalImageAttachment = {
  type: 'localImage';
  path: string;
  width?: number | null;
  height?: number | null;
  fileName?: string | null;
};

export type RemoteImageAttachment = {
  type: 'image';
  imageUrl: string;
};

export type MessageAttachment = LocalImageAttachment | RemoteImageAttachment;

export type QueuedUserMessage = {
  text: string;
  attachments?: MessageAttachment[];
};
