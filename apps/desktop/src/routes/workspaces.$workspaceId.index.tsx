import { createFileRoute } from '@tanstack/react-router';
import { SearchIcon } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { useNavigationActions } from '~/navigation/NavigationProvider';

export const Route = createFileRoute('/workspaces/$workspaceId/')({
  component: RouteComponent,
});

function RouteComponent() {
  const { openThreadSwitcher } = useNavigationActions();

  return (
    <div className="flex h-full w-full items-center justify-center px-6">
      <div className="w-full max-w-md space-y-3 text-center">
        <div className="text-sm font-semibold text-foreground">
          Open a thread to begin
        </div>
        <div className="text-xs text-muted-foreground">
          Select an open thread from the sidebar, or search your workspace for
          an existing one.
        </div>
        <div className="flex justify-center pt-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-2 text-xs"
            onClick={() => openThreadSwitcher()}
          >
            <SearchIcon className="h-4 w-4" />
            Open thread…
          </Button>
        </div>
      </div>
    </div>
  );
}
