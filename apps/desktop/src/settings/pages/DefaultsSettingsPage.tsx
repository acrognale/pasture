import { ChevronDownIcon } from 'lucide-react';
import { Button } from '~/components/ui/button';
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
  getReasoningControlKind,
  normalizeReasoningEffort,
} from '~/composer/model-options';
import { useWorkspaceComposerDefaults } from '../hooks/useWorkspaceComposerDefaults';

type DefaultsSettingsPageProps = {
  workspacePath: string;
};

export function DefaultsSettingsPage({
  workspacePath,
}: DefaultsSettingsPageProps) {
  const { defaults, disabled, updateSetting } =
    useWorkspaceComposerDefaults(workspacePath);

  const isModelName = (value: string | null | undefined): value is ModelName =>
    value != null && MODEL_OPTIONS.includes(value as ModelName);

  const selectedModel: ModelName = isModelName(defaults.model)
    ? defaults.model
    : 'gpt-5.2';

  const usesBinaryReasoning = getReasoningControlKind(selectedModel) === 'binary';

  const availableReasoningEfforts = getAvailableReasoningEfforts(selectedModel);

  const normalizedReasoningEffort = normalizeReasoningEffort(
    selectedModel,
    defaults.reasoningEffort ?? undefined
  );
  const selectedReasoningEffort = usesBinaryReasoning
    ? normalizedReasoningEffort === 'none'
      ? 'none'
      : 'medium'
    : normalizedReasoningEffort;

  const thinkingEnabled =
    usesBinaryReasoning && selectedReasoningEffort !== 'none';
  const selectedReasoningSummary = defaults.summary ?? ('auto' as const);
  const selectedSandbox = defaults.sandbox ?? ('read-only' as const);
  const selectedApproval = defaults.approval ?? ('on-request' as const);

  const handleModelDefaultChange = (nextModel: ModelName) => {
    if (getReasoningControlKind(nextModel) === 'binary') {
      const current = defaults.reasoningEffort ?? null;
      updateSetting({
        model: nextModel,
        reasoningEffort: current === 'none' ? 'none' : 'medium',
      });
      return;
    }

    const nextEffort = normalizeReasoningEffort(
      nextModel,
      selectedReasoningEffort
    );
    updateSetting({ model: nextModel, reasoningEffort: nextEffort });
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
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-foreground">Model & reasoning</span>
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
          {usesBinaryReasoning ? (
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Thinking</span>
              <div className="flex items-center justify-between gap-4 rounded-md border bg-background shadow-xs h-9 px-3">
                <span className="text-xs text-foreground">
                  {thinkingEnabled ? 'On' : 'Off'}
                </span>
                <Switch
                  checked={thinkingEnabled}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    updateSetting({
                      reasoningEffort: checked === true ? 'medium' : 'none',
                    })
                  }
                  aria-label="Thinking"
                />
              </div>
            </div>
          ) : (
            renderDropdown(
              'Reasoning effort',
              selectedReasoningEffort,
              availableReasoningEfforts,
              REASONING_EFFORT_DISPLAY,
              (next) => updateSetting({ reasoningEffort: next })
            )
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
            <span className="text-sm text-foreground">Safety defaults</span>
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
  );
}
