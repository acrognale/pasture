import { useState } from 'react';

import { cn } from '../lib/utils';
import type { TranscriptUserMessageCell } from '../types';
import { ImagePreview } from './ImagePreview';
import type { MessageVersionEntry } from './MessageVersions';
import { MessageVersions } from './MessageVersions';

type UserMessageProps = {
  cell: TranscriptUserMessageCell;
  /** Message versions for navigation */
  versions?: MessageVersionEntry[];
  /** Currently active conversation ID */
  activeConversationId?: string | null;
  /** Whether versions are loading */
  isVersionsLoading?: boolean;
  /** Callback when user selects a version */
  onSelectVersion?: (conversationId: string) => void;
  /** Callback when user copies the message */
  onCopy?: () => Promise<void>;
  /** Callback when user retries the message */
  onRetry?: () => Promise<void>;
  /** Callback when user edits and saves the message */
  onEdit?: (newMessage: string) => Promise<void>;
  /** Whether actions are currently in progress */
  isActionPending?: boolean;
};

const buttonBase =
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';

const ghostButton = cn(
  buttonBase,
  'hover:bg-accent hover:text-accent-foreground h-8 w-8'
);

// SVG Icons
const CopyIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
);

const RetryIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </svg>
);

const EditIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    <path d="m15 5 4 4" />
  </svg>
);

const CancelIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

const SaveIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
    <path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" />
    <path d="M7 3v4a1 1 0 0 0 1 1h7" />
  </svg>
);

export function UserMessage({
  cell,
  versions = [],
  activeConversationId = null,
  isVersionsLoading = false,
  onSelectVersion,
  onCopy,
  onRetry,
  onEdit,
  isActionPending = false,
}: UserMessageProps) {
  const message = cell.message ?? '';
  const hasImages = (cell.images?.length ?? 0) > 0;
  const hasMessageKind = !!cell.messageKind && cell.messageKind !== 'plain';
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(message);

  const handleCopy = async () => {
    await onCopy?.();
  };

  const handleRetry = async () => {
    await onRetry?.();
  };

  const handleSaveEdit = async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      return;
    }
    await onEdit?.(trimmed);
    setIsEditing(false);
  };

  return (
    <div className="w-full px-1.5 py-2 flex justify-end group">
      <div className="flex flex-col items-end gap-1 max-w-[80%]">
        <div className="bg-muted/60 rounded-lg px-3 py-2 w-full space-y-2">
          <div className="flex flex-1 space-y-1">
            <div className="w-full space-y-1">
              {isEditing ? (
                <textarea
                  className="w-full resize-none rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={Math.max(2, Math.min(8, draft.split('\n').length))}
                  disabled={isActionPending}
                />
              ) : (
                <div className="whitespace-pre-wrap leading-transcript font-transcript text-transcript-base text-foreground">
                  {message}
                </div>
              )}
              {hasMessageKind ? (
                <div className="text-muted-foreground text-xs">
                  /{cell.messageKind}
                </div>
              ) : null}
              {hasImages ? (
                <div className="space-y-1">
                  <div className="text-muted-foreground text-xs">
                    {cell.images?.length ?? 0} image
                    {(cell.images?.length ?? 0) === 1 ? '' : 's'} attached
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(cell.images ?? []).map((path) => (
                      <ImagePreview
                        key={path}
                        path={path}
                        alt={message || 'User attached image'}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex w-full items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity pr-1">
          {message ? (
            <button
              type="button"
              onClick={() => {
                void handleCopy();
              }}
              className={ghostButton}
              title="Copy as markdown"
            >
              <CopyIcon />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              void handleRetry();
            }}
            className={ghostButton}
            disabled={isActionPending}
            title="Retry from here"
          >
            <RetryIcon />
          </button>
          <button
            type="button"
            onClick={() => setIsEditing((prev) => !prev)}
            className={ghostButton}
            disabled={isActionPending}
            title={isEditing ? 'Cancel edit' : 'Edit message'}
          >
            {isEditing ? <CancelIcon /> : <EditIcon />}
          </button>
          {isEditing ? (
            <button
              type="button"
              onClick={() => {
                void handleSaveEdit();
              }}
              className={ghostButton}
              disabled={isActionPending}
              title="Save and retry from here"
            >
              <SaveIcon />
            </button>
          ) : null}
          <MessageVersions
            versions={versions}
            activeConversationId={activeConversationId}
            onSelectVersion={(conversationId) =>
              onSelectVersion?.(conversationId)
            }
            isLoading={isVersionsLoading}
          />
        </div>
      </div>
    </div>
  );
}
