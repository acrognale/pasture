import { useMemo } from 'react';

import { HostLayout } from '~/panels/HostLayout';
import { getConversationHostId } from '~/panels/host-ids';
import { usePanelManager } from '~/panels/PanelManagerProvider';

import { ConversationPanelServicesProvider } from './panels/ConversationPanelServices';
import { registerConversationPanels } from './panels/register';

registerConversationPanels();

export function WorkspaceConversationHost({ workspacePath }: { workspacePath: string }) {
  const hostId = useMemo(() => getConversationHostId(workspacePath), [workspacePath]);
  const host = usePanelManager((state) => state.hosts[hostId] ?? null);

  const hasAnyPanels = Boolean(
    host?.docks.editor.root || host?.docks.utility.root
  );

  return (
    <ConversationPanelServicesProvider>
      <div className="flex h-full w-full flex-col overflow-hidden">
        <div className="flex-1 min-h-0 flex overflow-hidden relative">
          {hasAnyPanels ? (
            <HostLayout hostId={hostId} responsiveRow />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
              Open a thread from the sidebar to begin.
            </div>
          )}
        </div>
      </div>
    </ConversationPanelServicesProvider>
  );
}

