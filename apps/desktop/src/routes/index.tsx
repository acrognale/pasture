import { createFileRoute } from '@tanstack/react-router';
import { WorkspaceLaunchpad } from '~/components/WorkspaceLaunchpad';

export const Route = createFileRoute('/')({
  component: RouteComponent,
});

function RouteComponent() {
  return <WorkspaceLaunchpad />;
}
