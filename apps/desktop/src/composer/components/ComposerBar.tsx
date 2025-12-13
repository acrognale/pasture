import { convertFileSrc } from '@tauri-apps/api/core';
import { ArrowUpIcon, SquareStopIcon, XIcon } from 'lucide-react';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { useAuthState } from '~/auth/useAuthState';
import { Codex } from '~/codex/client';
import { Button } from '~/components/ui/button';
import { useComposerConfig } from '~/composer/hooks/useComposerConfig';
import { useSlashCommands } from '~/composer/hooks/useSlashCommands';
import { useQueueableSendMessage } from '~/conversation/hooks/useQueueableSendMessage';
import {
  useConversationComposerLimits,
  useConversationIsRunning,
  useConversationIsSendingUserMessage,
} from '~/conversation/store/hooks';
import type { MessageAttachment } from '~/conversation/types';

import {
  type ComposerTurnConfig,
  createDefaultComposerConfig,
} from '../config';
import { type HandoffCommandResult } from '../slash-commands';
import { type SlashCommandInvocation } from '../types';
import { ComposerEditor, type ComposerEditorHandle } from './ComposerEditor';
import { ModelConfigSelector } from './ModelConfigSelector';

export type ComposerBarControls = {
  focus: () => void;
  setDraft: (value: string) => void;
  appendDraft: (value: string) => void;
  getDraft: () => string;
  appendAttachments: (attachments: MessageAttachment[]) => void;
};

export interface ComposerBarProps {
  workspacePath: string;
  conversationId: string | null;
  isTurnActive?: boolean;
  interruptPending?: boolean;
  stopButtonId?: string;
  onInterrupt: () => void;
  onScrollToBottom: () => void;
  focusInput?: boolean;
  onRequestFocus?: () => void;
  onComposerReady?: (controls: ComposerBarControls | null) => void;
  onHandoffComplete?: (result: HandoffCommandResult) => void;
  onHandoffStatusChange?: (running: boolean) => void;
}

const formatTokens = (value: number | null) => {
  if (value === null) {
    return '--';
  }

  if (value >= 1000) {
    const thousands = value / 1000;
    if (thousands >= 100) {
      return `${Math.round(thousands)}k`;
    }
    return `${thousands.toFixed(1).replace(/\.0$/, '')}k`;
  }

  return `${value}`;
};

const SLASH_NAME_PATTERN = /^[a-z0-9-]+$/i;

const parseSlashCommand = (input: string): SlashCommandInvocation | null => {
  if (!input.startsWith('/')) {
    return null;
  }

  const firstLine = input.split('\n', 1)[0] ?? '';
  const trimmed = firstLine.slice(1).trimStart();
  if (!trimmed) {
    return null;
  }

  const [rawName, ...rest] = trimmed.split(/\s+/);
  if (!rawName || !SLASH_NAME_PATTERN.test(rawName)) {
    return null;
  }

  const args = rest.length ? trimmed.slice(rawName.length).trim() : '';

  return {
    name: rawName.toLowerCase(),
    args: args.length > 0 ? args : null,
  };
};

type ComposerImageAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  previewUrl: string | null;
  width: number | null;
  height: number | null;
  path: string | null;
  status: 'saving' | 'ready' | 'error';
};

const createAttachmentId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const extractFileName = (
  value: string | null | undefined,
  fallback = 'image'
) => {
  if (!value) {
    return fallback;
  }
  const segments = value.split(/[/\\]/);
  const name = segments[segments.length - 1] ?? value;
  return name || fallback;
};

const safeConvertFileSrc = (path: string): string => {
  const trimmed = path.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.startsWith('data:') || /^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  try {
    if (typeof convertFileSrc === 'function') {
      return convertFileSrc(trimmed);
    }
  } catch {
    // Best-effort conversion only
  }
  return trimmed;
};

const revokePreviewUrl = (url: string | null) => {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
};

const releaseAttachments = (attachments: ComposerImageAttachment[]) => {
  attachments.forEach((attachment) => revokePreviewUrl(attachment.previewUrl));
};

const readImageDimensions = (
  file: File,
  previewUrl?: string | null
): Promise<{ width: number; height: number }> =>
  new Promise((resolve) => {
    const image = new Image();
    const url = previewUrl ?? URL.createObjectURL(file);
    image.onload = () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
      if (!previewUrl) {
        URL.revokeObjectURL(url);
      }
    };
    image.onerror = () => {
      resolve({ width: 0, height: 0 });
      if (!previewUrl) {
        URL.revokeObjectURL(url);
      }
    };
    image.src = url;
  });

const fileToBase64 = async (file: File) => {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return btoa(binary);
};

const toComposerAttachment = (
  attachment: MessageAttachment
): ComposerImageAttachment | null => {
  if (attachment.type === 'localImage') {
    const path = attachment.path;
    return {
      id: createAttachmentId(),
      fileName: extractFileName(attachment.fileName ?? path, 'attached-image'),
      mimeType: 'image/*',
      previewUrl: path ? safeConvertFileSrc(path) : null,
      width: attachment.width ?? null,
      height: attachment.height ?? null,
      path,
      status: path ? 'ready' : 'error',
    };
  }

  if (attachment.type === 'image') {
    return {
      id: createAttachmentId(),
      fileName: extractFileName(attachment.imageUrl, 'attached-image'),
      mimeType: 'image/*',
      previewUrl: attachment.imageUrl,
      width: null,
      height: null,
      path: null,
      status: 'ready',
    };
  }

  return null;
};

export function ComposerBar({
  workspacePath,
  conversationId,
  isTurnActive: isTurnActiveProp,
  interruptPending: interruptPendingProp,
  stopButtonId,
  onInterrupt,
  onScrollToBottom,
  focusInput,
  onRequestFocus,
  onComposerReady,
  onHandoffComplete,
  onHandoffStatusChange,
}: ComposerBarProps) {
  const authState = useAuthState();
  const { query: composerQuery, updateComposer } = useComposerConfig(
    workspacePath,
    conversationId
  );
  const composerConfig = composerQuery.data ?? createDefaultComposerConfig();
  const composerLimits = useConversationComposerLimits(conversationId);
  const contextTokensInWindow = composerLimits.contextTokensInWindow ?? null;
  const maxContextTokens = composerLimits.maxContextWindow ?? null;

  const normalizedModel = (composerConfig.model ?? '').trim().toLowerCase();
  const usesAnthropic =
    normalizedModel.startsWith('claude-') ||
    normalizedModel.startsWith('anthropic/claude-');
  const authDisabled =
    authState.isLoading ||
    (authState.data?.requiresAuth && !usesAnthropic) ||
    false;
  const authDisabledReason = (() => {
    if (authState.isLoading) {
      return 'Authentication in progress...';
    }
    if (authState.data?.requiresAuth && !usesAnthropic) {
      return 'Sign in with the Codex CLI to continue.';
    }
    return undefined;
  })();
  const disabled = authDisabled;
  const disabledReason = authDisabledReason;

  const { sendOrQueue, mutation } = useQueueableSendMessage(
    workspacePath,
    conversationId
  );
  const isSendingUserMessage =
    useConversationIsSendingUserMessage(conversationId);
  const isMutationPending = mutation.isPending || isSendingUserMessage;
  const slashCommands = useSlashCommands(workspacePath);
  const conversationIsRunning = useConversationIsRunning(conversationId);
  const isTurnActive = isTurnActiveProp ?? conversationIsRunning;
  const resolvedInterruptPending = interruptPendingProp ?? false;

  const [draft, setDraft] = useState('');
  const editorRef = useRef<ComposerEditorHandle | null>(null);
  const draftRef = useRef(draft);
  const [attachedImages, setAttachedImages] = useState<
    ComposerImageAttachment[]
  >([]);
  const attachedImagesRef = useRef(attachedImages);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    attachedImagesRef.current = attachedImages;
  }, [attachedImages]);

  useEffect(
    () => () => {
      releaseAttachments(attachedImagesRef.current);
    },
    []
  );

  const sendableAttachments = useMemo(
    () =>
      attachedImages
        .filter(
          (attachment) =>
            attachment.status === 'ready' && Boolean(attachment.path)
        )
        .map((attachment) => ({
          type: 'localImage' as const,
          path: attachment.path as string,
          width: attachment.width,
          height: attachment.height,
          fileName: attachment.fileName,
        })),
    [attachedImages]
  );

  const hasSavingAttachments = attachedImages.some(
    (attachment) => attachment.status === 'saving'
  );
  const hasReadyAttachments = sendableAttachments.length > 0;

  const canSend = () => {
    if (disabled || isMutationPending || hasSavingAttachments) {
      return false;
    }

    return draft.trim().length > 0 || hasReadyAttachments;
  };

  const handleComposerUpdate = useCallback(
    (updates: Partial<ComposerTurnConfig>) => {
      void updateComposer(updates);
    },
    [updateComposer]
  );

  const handleSlashCommand = useCallback(
    async (invocation: SlashCommandInvocation) => {
      if (!conversationId) {
        throw new Error('Conversation not available');
      }
      const command = slashCommands.resolve(invocation.name);
      if (!command) {
        const description = `Unknown slash command '/${invocation.name}'.`;
        toast.error('Command not found', { description });
        throw new Error(description);
      }

      if (isTurnActive && !command.availableDuringTurn) {
        slashCommands.notifyUnavailable(command);
        throw new Error(`'/${command.id}' unavailable while a turn is active`);
      }

      try {
        if (invocation.name === 'handoff') {
          onHandoffStatusChange?.(true);
        }
        const result = await slashCommands.execute({
          conversationId,
          invocation,
        });

        if (result && result.type === 'handoff') {
          onHandoffComplete?.(result);
        }
      } catch (error) {
        slashCommands.notifyFailure(command, error);
        throw error;
      } finally {
        if (invocation.name === 'handoff') {
          onHandoffStatusChange?.(false);
        }
      }
    },
    [
      conversationId,
      isTurnActive,
      onHandoffComplete,
      onHandoffStatusChange,
      slashCommands,
    ]
  );

  const appendComposerAttachments = useCallback(
    (attachments: MessageAttachment[]) => {
      if (!attachments || attachments.length === 0) {
        return;
      }
      setAttachedImages((previous) => {
        const mapped = attachments
          .map((attachment) => toComposerAttachment(attachment))
          .filter(Boolean) as ComposerImageAttachment[];
        if (mapped.length === 0) {
          return previous;
        }
        return [...previous, ...mapped];
      });
    },
    []
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachedImages((previous) => {
      const existing = previous.find((attachment) => attachment.id === id);
      if (existing) {
        revokePreviewUrl(existing.previewUrl);
      }
      return previous.filter((attachment) => attachment.id !== id);
    });
  }, []);

  const handlePastedImages = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        const id = createAttachmentId();
        const previewUrl = URL.createObjectURL(file);
        const fileName = extractFileName(file.name, 'pasted-image');
        const mimeType = file.type || 'image/png';
        const { width, height } = await readImageDimensions(file, previewUrl);

        setAttachedImages((previous) => [
          ...previous,
          {
            id,
            fileName,
            mimeType,
            previewUrl,
            width,
            height,
            path: null,
            status: 'saving',
          },
        ]);

        try {
          const dataBase64 = await fileToBase64(file);
          const response = await Codex.savePastedImage({
            workspacePath,
            dataBase64,
            fileName,
            mimeType,
            width,
            height,
          });

          setAttachedImages((previous) =>
            previous.map((attachment) =>
              attachment.id === id
                ? {
                    ...attachment,
                    status: 'ready',
                    path: response.path,
                    width: response.width || width,
                    height: response.height || height,
                    fileName: response.fileName ?? attachment.fileName,
                  }
                : attachment
            )
          );
        } catch (error) {
          setAttachedImages((previous) =>
            previous.map((attachment) =>
              attachment.id === id
                ? { ...attachment, status: 'error' }
                : attachment
            )
          );

          const description =
            error instanceof Error
              ? error.message
              : 'Unable to save pasted image.';
          toast.error('Failed to attach image.', { description });
        }
      }
    },
    [workspacePath]
  );

  const submitDraft = () => {
    const draftSnapshot = draftRef.current;
    const expandedDraft =
      editorRef.current?.getExpandedTextForSend?.() ?? draftSnapshot;
    const text = expandedDraft.trim();
    const attachmentsForSend = sendableAttachments;
    if (!text && attachmentsForSend.length === 0) {
      return;
    }
    // console.debug('submitDraft', { text, attachments: attachmentsForSend.length, isTurnActive });

    const slash = parseSlashCommand(text);
    if (slash && attachmentsForSend.length === 0) {
      if (disabled || isMutationPending) {
        return;
      }

      setDraft('');
      onScrollToBottom();

      void handleSlashCommand(slash).catch(() => {
        setDraft(draftSnapshot);
      });

      return;
    }

    if (!canSend()) {
      return;
    }

    const attachmentSnapshot = attachedImages;
    setDraft('');
    onScrollToBottom();
    setAttachedImages([]);

    void sendOrQueue({ text, attachments: attachmentsForSend })
      .then(() => {
        releaseAttachments(attachmentSnapshot);
      })
      .catch(() => {
        setDraft(draftSnapshot);
        setAttachedImages(attachmentSnapshot);
      });
  };

  const focusComposer = useCallback(() => {
    editorRef.current?.focus();
  }, []);
  const controls: ComposerBarControls = useMemo(
    () => ({
      focus: () => {
        focusComposer();
      },
      setDraft: (value: string) => {
        setDraft(value);
      },
      appendDraft: (value: string) => {
        setDraft((previous) => `${previous}${value}`);
      },
      getDraft: () => draftRef.current,
      appendAttachments: (attachments: MessageAttachment[]) => {
        appendComposerAttachments(attachments);
      },
    }),
    [appendComposerAttachments, focusComposer]
  );

  useEffect(() => {
    if (focusInput) {
      focusComposer();
    }
    if (onRequestFocus) {
      onRequestFocus();
    }
  }, [focusInput, onRequestFocus, focusComposer]);

  useEffect(() => {
    const handler = onComposerReady;
    handler?.(controls);
    return () => {
      handler?.(null);
    };
  }, [onComposerReady, controls]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (disabled) {
      return;
    }

    if (isTurnActive) {
      onInterrupt();
      return;
    }

    submitDraft();
  };

  return (
    <form onSubmit={handleSubmit} className="pointer-events-auto">
      <div className="flex flex-col gap-3 p-3 relative bg-background border border-border rounded-lg">
        {disabled && disabledReason && (
          <div className="rounded-md bg-warning/10 px-3 py-2 text-xs font-medium text-warning-foreground">
            {disabledReason}
          </div>
        )}
        <div className="flex-1">
          <ComposerEditor
            ref={editorRef}
            value={draft}
            onChange={setDraft}
            onSubmit={submitDraft}
            workspacePath={workspacePath}
            conversationId={conversationId}
            isTurnActive={isTurnActive}
            onEscape={() => {
              if (!isTurnActive) {
                return false;
              }
              onInterrupt();
              return true;
            }}
            onPasteImages={(files) => {
              void handlePastedImages(files);
            }}
            disabled={isMutationPending || disabled}
            ariaBusy={isMutationPending || hasSavingAttachments}
            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 resize-none p-0 bg-transparent min-h-[72px] max-h-[200px] overflow-y-auto"
          />
        </div>
        {attachedImages.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {attachedImages.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center gap-2 rounded-md bg-muted/60 border border-border/60 px-2 py-1"
              >
                {attachment.previewUrl ? (
                  <img
                    src={attachment.previewUrl}
                    alt={attachment.fileName}
                    className="h-10 w-10 rounded border border-border object-cover"
                  />
                ) : null}
                <div className="min-w-0">
                  <div className="text-xs font-medium text-foreground truncate max-w-[160px]">
                    {attachment.fileName}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {attachment.status === 'saving'
                      ? 'Saving...'
                      : attachment.status === 'error'
                        ? 'Attach failed'
                        : `${attachment.width ?? '?'} x ${attachment.height ?? '?'}`}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => removeAttachment(attachment.id)}
                  disabled={isMutationPending}
                >
                  <XIcon className="size-3" />
                </Button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ModelConfigSelector
              conversationId={conversationId}
              composerConfig={composerConfig}
              disabled={isMutationPending || isTurnActive || disabled}
              onUpdate={handleComposerUpdate}
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="min-w-[72px] text-xs font-semibold text-muted-foreground text-right font-mono">
              {formatTokens(contextTokensInWindow)} /{' '}
              {formatTokens(maxContextTokens)}
            </span>
            {isTurnActive ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="rounded-full size-8 text-muted-foreground hover:text-foreground"
                aria-busy={resolvedInterruptPending}
                disabled={resolvedInterruptPending}
                id={stopButtonId}
                onClick={onInterrupt}
              >
                <SquareStopIcon className="size-4" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                variant="ghost"
                className="rounded-full size-8"
                disabled={!canSend()}
                aria-busy={isMutationPending}
              >
                <ArrowUpIcon className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
