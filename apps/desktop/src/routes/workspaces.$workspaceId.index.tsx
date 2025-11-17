import { createFileRoute } from '@tanstack/react-router';
import { Card } from '~/components/ui/card';
import { ConversationPaneHeader } from '~/conversation/components/ConversationPaneHeader';
import { decodeWorkspaceId } from '~/lib/routing';

export const Route = createFileRoute('/workspaces/$workspaceId/')({
  component: RouteComponent,
});

function RouteComponent() {
  const { workspaceId } = Route.useParams();
  const workspacePath = decodeWorkspaceId(workspaceId);

  return (
    <div className="flex flex-1 flex-col h-full overflow-hidden relative">
      <ConversationPaneHeader workspacePath={workspacePath} />
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="flex h-full items-center justify-center">
            <Card className="flex w-full max-w-lg flex-col items-center justify-center gap-3 border-dashed py-6 text-center text-muted-foreground">
              <p className="text-sm font-medium">Choose a session to begin</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Codex conversations will appear here once a session is selected.
                Use the sidebar to switch sessions or create a new one.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
