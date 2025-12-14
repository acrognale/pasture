import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDownIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAuthState } from '~/auth/useAuthState';
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
  MODEL_DISPLAY_NAMES,
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

type SettingsPage = 'features' | 'defaults' | 'authentication';

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
  const authState = useAuthState();
  const [anthropicVerifier, setAnthropicVerifier] = useState<string | null>(
    null
  );
  const [anthropicAuthUrl, setAnthropicAuthUrl] = useState<string | null>(null);
  const [anthropicCode, setAnthropicCode] = useState('');
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

  const anthropicStatus = useQuery({
    queryKey: ['anthropic-oauth-status'] as const,
    queryFn: () => Codex.anthropicOauthStatus(),
    staleTime: Infinity,
  });

  const anthropicAuthorize = useMutation({
    mutationFn: async () => Codex.anthropicOauthAuthorize(),
    onSuccess: (result) => {
      setAnthropicVerifier(result.verifier);
      setAnthropicAuthUrl(result.url);
      setAnthropicCode('');
      toast.success('Claude Code authorization started.');
    },
    onError: (error) => {
      const description =
        error instanceof Error ? error.message : 'Please try again.';
      toast.error('Failed to start Claude Code authorization.', {
        description,
      });
    },
  });

  const anthropicExchange = useMutation({
    mutationFn: async () => {
      if (!anthropicVerifier) {
        throw new Error('Missing verifier. Start login again.');
      }
      const code = anthropicCode.trim();
      if (!code) {
        throw new Error('Paste the code from Claude Code login.');
      }
      return Codex.anthropicOauthExchange({
        code,
        verifier: anthropicVerifier,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['anthropic-oauth-status'],
      });
      toast.success('Claude Code connected.');
    },
    onError: (error) => {
      const description =
        error instanceof Error ? error.message : 'Please try again.';
      toast.error('Failed to complete Claude Code login.', { description });
    },
  });

  const anthropicLogout = useMutation({
    mutationFn: async () => Codex.anthropicOauthLogout(),
    onSuccess: async () => {
      setAnthropicVerifier(null);
      setAnthropicAuthUrl(null);
      setAnthropicCode('');
      await queryClient.invalidateQueries({
        queryKey: ['anthropic-oauth-status'],
      });
      toast.success('Claude Code disconnected.');
    },
    onError: (error) => {
      const description =
        error instanceof Error ? error.message : 'Please try again.';
      toast.error('Failed to disconnect Claude Code.', { description });
    },
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
    value != null && MODEL_OPTIONS.includes(value as ModelName);

  const selectedModel: ModelName = isModelName(defaults.model)
    ? defaults.model
    : 'gpt-5.2';

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
    { id: 'authentication', label: 'Authentication' },
  ];

  const updateSetting = (changes: Partial<WorkspaceComposerDefaultsState>) => {
    mutation.mutate(changes);
  };

  const handleModelDefaultChange = (nextModel: ModelName) => {
    const normalizedEffort = normalizeReasoningEffort(
      nextModel,
      selectedReasoningEffort
    );
    updateSetting({ model: nextModel, reasoningEffort: normalizedEffort });
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

            {page === 'authentication' ? (
              <div className="space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm text-foreground">
                        Codex (OpenAI)
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Used for OpenAI models. Anthropic models can use Claude
                        Code login below.
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Status:{' '}
                    {authState.isLoading
                      ? 'Loading…'
                      : authState.data?.isAuthenticated
                        ? `Signed in${
                            authState.data.email
                              ? ` as ${authState.data.email}`
                              : ''
                          }`
                        : 'Not signed in'}
                  </div>
                  {authState.data?.lastError ? (
                    <div className="text-xs text-error-foreground">
                      {authState.data.lastError}
                    </div>
                  ) : null}
                </div>

                <div className="border-t border-border/60 pt-6 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm text-foreground">
                        Claude Code
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Connect using your Claude Code OAuth credentials.
                        Pasture refreshes tokens automatically.
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={anthropicAuthorize.isPending}
                        onClick={() => anthropicAuthorize.mutate()}
                      >
                        Start login
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={
                          anthropicLogout.isPending ||
                          !(anthropicStatus.data?.isAuthenticated ?? false)
                        }
                        onClick={() => anthropicLogout.mutate()}
                      >
                        Disconnect
                      </Button>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Status:{' '}
                    {anthropicStatus.isLoading
                      ? 'Loading…'
                      : anthropicStatus.data?.isAuthenticated
                        ? anthropicStatus.data.isExpired
                          ? 'Connected (expired; will refresh on use)'
                          : 'Connected'
                        : 'Not connected'}
                  </div>
                  {anthropicStatus.data?.lastError ? (
                    <div className="text-xs text-error-foreground">
                      {anthropicStatus.data.lastError}
                    </div>
                  ) : null}

                  {anthropicAuthUrl ? (
                    <div className="space-y-2">
                      <div className="text-xs text-muted-foreground">
                        1) Open this URL in your browser and complete login.
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          className="flex-1 h-9 rounded-md border border-border bg-background px-3 text-xs text-foreground"
                          readOnly
                          value={anthropicAuthUrl}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            void (async () => {
                              try {
                                await navigator.clipboard.writeText(
                                  anthropicAuthUrl
                                );
                                toast.success('Copied authorization URL.');
                              } catch (error) {
                                const description =
                                  error instanceof Error
                                    ? error.message
                                    : 'Copy failed.';
                                toast.error('Failed to copy URL.', {
                                  description,
                                });
                              }
                            })();
                          }}
                        >
                          Copy
                        </Button>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        2) Paste the code you receive here.
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          className="flex-1 h-9 rounded-md border border-border bg-background px-3 text-xs text-foreground"
                          placeholder="Paste code…"
                          value={anthropicCode}
                          onChange={(e) => setAnthropicCode(e.target.value)}
                        />
                        <Button
                          type="button"
                          size="sm"
                          disabled={anthropicExchange.isPending}
                          onClick={() => anthropicExchange.mutate()}
                        >
                          Complete
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      Start login to get an authorization link.
                    </div>
                  )}
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
                      MODEL_DISPLAY_NAMES,
                      handleModelDefaultChange
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
