import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDownIcon } from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { Switch } from '~/components/ui/switch';
import {
  APPROVAL_DISPLAY,
  APPROVAL_HELP_TEXT,
  APPROVAL_OPTIONS,
  REASONING_EFFORT_DISPLAY,
  REASONING_SUMMARY_DISPLAY,
  REASONING_SUMMARY_HELP_TEXT,
  REASONING_SUMMARY_OPTIONS,
  SANDBOX_DISPLAY,
  SANDBOX_OPTIONS,
} from '~/composer/components/ModelConfigSelector';
import {
  MODEL_OPTIONS,
  type ModelName,
  getAvailableReasoningEfforts,
  normalizeReasoningEffort,
} from '~/composer/model-options';
import {
  type WorkspaceComposerDefaultsState,
  normalizeWorkspaceComposerDefaults,
} from '~/composer/workspace-defaults';
import { createWorkspaceKeys } from '~/lib/workspaceKeys';

type SettingsPage = 'features' | 'defaults';

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
    mutationFn: async (changes: Partial<WorkspaceComposerDefaultsState>) => {
      const payload = {
        workspacePath,
        model: changes.model ?? undefined,
        reasoningEffort: changes.reasoningEffort ?? undefined,
        reasoningSummary: changes.summary ?? undefined,
        sandbox: changes.sandbox ?? undefined,
        approval: changes.approval ?? undefined,
        webSearchEnabled: changes.webSearchEnabled ?? undefined,
      } as const;

      return Codex.updateWorkspaceSettings(payload).then(
        normalizeWorkspaceComposerDefaults
      );
    },
    onMutate: async (changes) => {
      await queryClient.cancelQueries({ queryKey: keys.composerDefaults() });
      const previous = queryClient.getQueryData<WorkspaceComposerDefaultsState>(
        keys.composerDefaults()
      );
      queryClient.setQueryData<WorkspaceComposerDefaultsState>(
        keys.composerDefaults(),
        (current) => ({
          ...(current ?? normalizeWorkspaceComposerDefaults(null)),
          ...changes,
        })
      );
      return { previous };
    },
    onError: (error, _changes, context) => {
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

  const defaults = data ?? normalizeWorkspaceComposerDefaults(null);

  const isModelName = (value: string | null | undefined): value is ModelName =>
    value === 'gpt-5.1' ||
    value === 'gpt-5.1-codex' ||
    value === 'gpt-5.1-codex-max' ||
    value === 'gpt-5.1-codex-mini';

  const selectedModel: ModelName = isModelName(defaults.model)
    ? defaults.model
    : 'gpt-5.1-codex-max';

  const modelDisplayMap: Record<ModelName, string> = {
    'gpt-5.1': 'GPT-5.1',
    'gpt-5.1-codex': 'GPT-5.1 Codex',
    'gpt-5.1-codex-max': 'GPT-5.1 Codex Max',
    'gpt-5.1-codex-mini': 'GPT-5.1 Codex Mini',
  };

  const availableReasoningEfforts = getAvailableReasoningEfforts(selectedModel);

  const selectedReasoningEffort = normalizeReasoningEffort(
    selectedModel,
    defaults.reasoningEffort ?? undefined
  );
  const selectedReasoningSummary = defaults.summary ?? ('auto' as const);
  const selectedSandbox = defaults.sandbox ?? ('read-only' as const);
  const selectedApproval = defaults.approval ?? ('on-request' as const);
  const webSearchEnabled = defaults.webSearchEnabled ?? false;

  const disabled = isLoading || mutation.isPending;

  const pages: { id: SettingsPage; label: string }[] = [
    { id: 'features', label: 'Features' },
    { id: 'defaults', label: 'Defaults' },
  ];

  const updateSetting = (changes: Partial<WorkspaceComposerDefaultsState>) => {
    mutation.mutate(changes);
  };

  const renderDropdown = <T extends string>(
    label: string,
    value: T,
    options: readonly T[],
    displayMap: Record<T, string>,
    onSelect: (next: T) => void,
    helpTextMap?: Record<T, string>
  ) => (
    <div className="space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-between text-xs h-9 font-normal"
            disabled={disabled}
          >
            <span className="truncate text-foreground">
              {displayMap[value] ?? value}
            </span>
            <ChevronDownIcon className="size-3 opacity-50 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[320px]">
          {options.map((option) => (
            <DropdownMenuItem
              key={option}
              disabled={disabled}
              onSelect={() => onSelect(option)}
            >
              {helpTextMap ? (
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm text-foreground">
                    {displayMap[option] ?? option}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {helpTextMap[option]}
                  </span>
                </div>
              ) : (
                <span className="text-sm text-foreground">
                  {displayMap[option] ?? option}
                </span>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

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
                      Let Codex use its built-in web_search tool. Applies to new
                      threads.
                    </span>
                  </div>
                  <Switch
                    checked={webSearchEnabled}
                    disabled={disabled}
                    onCheckedChange={(checked) =>
                      updateSetting({ webSearchEnabled: checked === true })
                    }
                    aria-label="Allow web search"
                  />
                </div>
              </div>
            ) : null}

            {page === 'defaults' ? (
              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm text-foreground">
                        Model & reasoning
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Defaults applied to every new thread in this workspace.
                      </span>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {renderDropdown(
                      'Default model',
                      selectedModel,
                      MODEL_OPTIONS,
                      modelDisplayMap,
                      (next) => updateSetting({ model: next })
                    )}
                    {renderDropdown(
                      'Reasoning effort',
                      selectedReasoningEffort,
                      availableReasoningEfforts,
                      REASONING_EFFORT_DISPLAY,
                      (next) => updateSetting({ reasoningEffort: next })
                    )}
                    {renderDropdown(
                      'Reasoning summaries',
                      selectedReasoningSummary,
                      REASONING_SUMMARY_OPTIONS,
                      REASONING_SUMMARY_DISPLAY,
                      (next) => updateSetting({ summary: next }),
                      REASONING_SUMMARY_HELP_TEXT
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm text-foreground">
                        Safety defaults
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Sandbox and approval behavior for new threads.
                      </span>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {renderDropdown(
                      'Sandbox mode',
                      selectedSandbox,
                      SANDBOX_OPTIONS,
                      SANDBOX_DISPLAY,
                      (next) => updateSetting({ sandbox: next })
                    )}
                    {renderDropdown(
                      'Approval policy',
                      selectedApproval,
                      APPROVAL_OPTIONS,
                      APPROVAL_DISPLAY,
                      (next) => updateSetting({ approval: next }),
                      APPROVAL_HELP_TEXT
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
