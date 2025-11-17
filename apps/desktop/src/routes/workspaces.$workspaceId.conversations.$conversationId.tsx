import { createFileRoute } from '@tanstack/react-router';
import { ConversationPane } from '~/conversation/ConversationPane';
import { decodeWorkspaceId } from '~/lib/routing';

export const Route = createFileRoute(
  '/workspaces/$workspaceId/conversations/$conversationId'
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { workspaceId, conversationId } = Route.useParams();

  const workspacePath = decodeWorkspaceId(workspaceId);

  return (
    <ConversationPane
      workspacePath={workspacePath}
      conversationId={conversationId}
    />
  );
}
