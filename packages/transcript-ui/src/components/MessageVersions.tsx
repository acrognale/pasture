/**
 * Message version entry for version navigation
 */
export type MessageVersionEntry = {
  conversationId: string;
  createdAt: string;
  parentConversationId: string | null;
  forkedAtNthUserMessage: number | null;
};

type MessageVersionsProps = {
  versions: MessageVersionEntry[];
  activeConversationId: string | null;
  onSelectVersion: (conversationId: string) => void;
  isLoading?: boolean;
};

export const MessageVersions = ({
  versions,
  activeConversationId,
  onSelectVersion,
  isLoading,
}: MessageVersionsProps) => {
  if (!versions || versions.length <= 1) {
    return null;
  }

  const activeIndex = versions.findIndex(
    (version) => version.conversationId === activeConversationId
  );
  const clampedIndex = activeIndex === -1 ? 0 : activeIndex;
  const canPrev = clampedIndex > 0 && !isLoading;
  const canNext = clampedIndex < versions.length - 1 && !isLoading;

  return (
    <div className="inline-flex h-8 items-center gap-1 text-muted-foreground">
      <button
        type="button"
        className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted disabled:opacity-50 disabled:hover:bg-transparent"
        aria-label="Previous version"
        disabled={!canPrev}
        onClick={() => {
          if (canPrev) {
            onSelectVersion(versions[clampedIndex - 1]?.conversationId);
          }
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
          className="text-muted-foreground"
        >
          <path d="M11.5292 3.7793C11.7889 3.5196 12.211 3.5196 12.4707 3.7793C12.7304 4.039 12.7304 4.461 12.4707 4.7207L7.19136 10L12.4707 15.2793L12.5556 15.3838C12.7261 15.6419 12.6979 15.9934 12.4707 16.2207C12.2434 16.448 11.8919 16.4762 11.6337 16.3057L11.5292 16.2207L5.77925 10.4707C5.51955 10.211 5.51955 9.789 5.77925 9.5293L11.5292 3.7793Z" />
        </svg>
      </button>
      <div className="px-0.5 text-transcript-base font-semibold tabular-nums">
        {clampedIndex + 1}/{versions.length}
      </div>
      <button
        type="button"
        className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted disabled:opacity-50 disabled:hover:bg-transparent"
        aria-label="Next version"
        disabled={!canNext}
        onClick={() => {
          if (canNext) {
            onSelectVersion(versions[clampedIndex + 1]?.conversationId);
          }
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
          className="text-muted-foreground"
        >
          <path d="M7.52925 3.7793C7.75652 3.55203 8.10803 3.52383 8.36616 3.69434L8.47065 3.7793L14.2207 9.5293C14.4804 9.789 14.4804 10.211 14.2207 10.4707L8.47065 16.2207C8.21095 16.4804 7.78895 16.4804 7.52925 16.2207C7.26955 15.961 7.26955 15.539 7.52925 15.2793L12.8085 10L7.52925 4.7207L7.44429 4.61621C7.27378 4.35808 7.30198 4.00657 7.52925 3.7793Z" />
        </svg>
      </button>
    </div>
  );
};
