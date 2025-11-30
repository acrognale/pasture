import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Codex } from '~/codex/client';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Switch } from '~/components/ui/switch';
import {
  type WorkspaceComposerDefaultsState,
  normalizeWorkspaceComposerDefaults,
} from '~/composer/workspace-defaults';
import { createWorkspaceKeys } from '~/lib/workspaceKeys';

type SettingsPage = 'features';

type SettingsModalProps = {
  workspacePath: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SettingsModal({
  workspacePath,
  open,
  onOpenChange,
}: SettingsModalProps) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState<SettingsPage>('features');
  const keys = useMemo(
    () => createWorkspaceKeys(workspacePath),
    [workspacePath]
  );

  const { data, isLoading } = useQuery({
    queryKey: keys.composerDefaults(),
    queryFn: () =>
      Codex.getWorkspaceComposerDefaults({ workspacePath }).then(
        normalizeWorkspaceComposerDefaults
      ),
    staleTime: Infinity,
  });

  const mutation = useMutation({
    mutationFn: async (enabled: boolean) =>
      Codex.updateWorkspaceSettings({
        workspacePath,
        webSearchEnabled: enabled,
      }).then(normalizeWorkspaceComposerDefaults),
    onMutate: async (enabled) => {
      await queryClient.cancelQueries({ queryKey: keys.composerDefaults() });
      const previous = queryClient.getQueryData<WorkspaceComposerDefaultsState>(
        keys.composerDefaults()
      );
      queryClient.setQueryData<WorkspaceComposerDefaultsState>(
        keys.composerDefaults(),
        (current) => ({
          ...(current ?? normalizeWorkspaceComposerDefaults(null)),
          webSearchEnabled: enabled,
        })
      );
      return { previous };
    },
    onError: (error, _enabled, context) => {
      if (context?.previous) {
        queryClient.setQueryData(keys.composerDefaults(), context.previous);
      }
      const description =
        error instanceof Error ? error.message : 'Please try again.';
      toast.error('Failed to update settings.', { description });
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(keys.composerDefaults(), settings);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.composerDefaults() });
    },
  });

  const webSearchEnabled = data?.webSearchEnabled ?? false;
  const pages: { id: SettingsPage; label: string }[] = [
    { id: 'features', label: 'Features' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl pt-8 pb-16">
        <DialogHeader className="pb-2">
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-[180px_1fr] gap-6">
          <div className="border-r border-border/60 rounded-none">
            <div className="flex flex-col">
              {pages.map((item) => (
                <Button
                  key={item.id}
                  type="button"
                  variant="ghost"
                  className={`justify-start rounded-none px-4 py-2 text-sm ${
                    page === item.id
                      ? 'bg-accent/60 text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setPage(item.id)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            {page === 'features' ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm text-foreground">
                      Allow web search
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Let Codex use its built-in web_search tool. Changes apply
                      to new threads you start after toggling.
                    </span>
                  </div>
                  <Switch
                    checked={webSearchEnabled}
                    disabled={isLoading || mutation.isPending}
                    onCheckedChange={(checked) =>
                      mutation.mutate(checked === true)
                    }
                    aria-label="Allow web search"
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
