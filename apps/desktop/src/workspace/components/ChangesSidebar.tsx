import { useMemo } from 'react';
import { dispatchOpenReviewOverlayEvent } from '~/conversation/events';
import {
  useConversationHasTurnDiffHistory,
  useConversationLatestTurnDiff,
  useConversationTurnDiffHistory,
} from '~/conversation/store/hooks';
import { cn, makePathRelative } from '~/lib/utils';
import { buildFileDiffStats, parseUnifiedDiff } from '~/review/diff';

import { ChangesSidebarContent } from './ChangesSidebarContent';
import { ChangesSidebarHeader } from './ChangesSidebarHeader';

type ChangesSidebarProps = {
  workspacePath: string;
  conversationId: string | null;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
};

export function ChangesSidebar({
  workspacePath,
  conversationId,
  isCollapsed,
  onToggleCollapse,
}: ChangesSidebarProps) {
  const hasReviewHistory = useConversationHasTurnDiffHistory(
    conversationId ?? ''
  );
  const turnDiffHistory = useConversationTurnDiffHistory(conversationId ?? '');
  const latestDiff = useConversationLatestTurnDiff(conversationId ?? '');

  const processedFiles = useMemo(() => {
    if (!turnDiffHistory.length && !latestDiff?.unifiedDiff) {
      return [];
    }

    // Ensure we always include the latest diff even if history hasn't been
    // recorded yet (e.g. during the active turn).
    const sortedHistory = [...turnDiffHistory];
    if (latestDiff && !turnDiffHistory.includes(latestDiff)) {
      sortedHistory.push(latestDiff);
    }

    sortedHistory.sort((a, b) => a.turnNumber - b.turnNumber);

    const statsByPath = new Map<string, { added: number; removed: number }>();
    const latestFileByPath = new Map<
      string,
      ReturnType<typeof parseUnifiedDiff>['files'][number]
    >();

    sortedHistory.forEach((turnDiff) => {
      if (!turnDiff.unifiedDiff) return;
      const parsed = parseUnifiedDiff(turnDiff.unifiedDiff);
      const fileStats = buildFileDiffStats(parsed.files);

      parsed.files.forEach((file) => {
        const path = file.displayPath;
        const previous = statsByPath.get(path) ?? { added: 0, removed: 0 };
        const stats = fileStats.get(file.id) ?? { added: 0, removed: 0 };
        statsByPath.set(path, {
          added: previous.added + stats.added,
          removed: previous.removed + stats.removed,
        });
        // Keep the latest representation so status reflects the newest change.
        latestFileByPath.set(path, { ...file, id: path });
      });
    });

    return Array.from(latestFileByPath.entries())
      .map(([path, file]) => ({
        file,
        stats: statsByPath.get(path) ?? { added: 0, removed: 0 },
        relativePath: makePathRelative(workspacePath, path),
      }))
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }, [latestDiff, turnDiffHistory, workspacePath]);

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col border-l border-border/60 bg-muted/20 transition-all duration-200',
        isCollapsed ? 'w-12' : 'w-72'
      )}
    >
      <ChangesSidebarHeader
        conversationId={conversationId}
        hasReviewHistory={hasReviewHistory}
        fileCount={processedFiles.length}
        isCollapsed={isCollapsed}
        onToggleCollapse={onToggleCollapse}
      />
      {!isCollapsed ? (
        <ChangesSidebarContent
          files={processedFiles}
          onFileClick={(file) => {
            if (conversationId) {
              dispatchOpenReviewOverlayEvent(conversationId, file.displayPath);
            }
          }}
        />
      ) : null}
    </aside>
  );
}
