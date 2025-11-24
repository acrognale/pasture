import type { MessageVersionEntry } from '../hooks/useMessageVersions';

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

  return (
    <div className="flex items-center gap-2 text-transcript-micro text-muted-foreground">
      <span className="whitespace-nowrap">
        Version {activeIndex + 1} / {versions.length}
      </span>
      <div className="flex flex-wrap items-center gap-1">
        {versions.map((version, index) => {
          const isActive = version.conversationId === activeConversationId;
          return (
            <button
              key={version.conversationId}
              type="button"
              className={[
                'px-2 py-1 rounded-full border text-transcript-micro leading-transcript',
                isActive
                  ? 'border-foreground text-foreground bg-muted'
                  : 'border-border text-muted-foreground bg-muted/60 hover:text-foreground',
                isLoading ? 'opacity-70 cursor-wait' : 'transition-colors',
              ].join(' ')}
              disabled={isActive || isLoading}
              onClick={() => {
                onSelectVersion(version.conversationId);
              }}
              aria-pressed={isActive}
              aria-label={`Switch to version ${index + 1}`}
            >
              V{index + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
};
