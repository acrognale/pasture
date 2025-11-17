import { ChevronDownIcon } from 'lucide-react';
import { RefObject, useMemo, useRef } from 'react';
import type {
  AskForApproval,
  ReasoningEffort,
  ReasoningSummary,
  SandboxMode,
} from '~/codex.gen';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import {
  COMPOSER_BREAKPOINTS,
  useContainerQuery,
} from '~/lib/hooks/useContainerQuery';

import { type ComposerTurnConfig, createDefaultComposerConfig } from '../types';
import { SettingsPopover } from './SettingsPopover';

export type ModelName = 'gpt-5.1' | 'gpt-5.1-codex' | 'gpt-5.1-codex-mini';

const MODEL_DISPLAY_NAMES: Record<ModelName, string> = {
  'gpt-5.1': 'GPT-5.1',
  'gpt-5.1-codex': 'GPT-5.1 Codex',
  'gpt-5.1-codex-mini': 'GPT-5.1 Codex Mini',
};

export const REASONING_EFFORT_OPTIONS: readonly ReasoningEffort[] = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
] as const;

export const REASONING_EFFORT_DISPLAY: Record<ReasoningEffort, string> = {
  none: 'Reasoning off',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

const getAvailableReasoningEfforts = (model: ModelName): ReasoningEffort[] => {
  if (model === 'gpt-5.1-codex') {
    return ['low', 'medium', 'high'];
  }
  if (model === 'gpt-5.1-codex-mini') {
    return ['medium', 'high'];
  }
  return [...REASONING_EFFORT_OPTIONS];
};

export const SANDBOX_OPTIONS: readonly SandboxMode[] = [
  'read-only',
  'workspace-write',
  'danger-full-access',
] as const;

export const SANDBOX_DISPLAY: Record<SandboxMode, string> = {
  'read-only': 'Read-only',
  'workspace-write': 'Workspace write',
  'danger-full-access': 'Full access',
};

export const APPROVAL_OPTIONS: readonly AskForApproval[] = [
  'on-request',
  'untrusted',
  'on-failure',
  'never',
] as const;

export const APPROVAL_DISPLAY: Record<AskForApproval, string> = {
  'on-request': 'Let Codex decide',
  untrusted: 'Always ask (untrusted)',
  'on-failure': 'Ask after failure',
  never: 'Never ask',
};

export const APPROVAL_HELP_TEXT: Record<AskForApproval, string> = {
  'on-request': 'Codex will request approval when it deems necessary.',
  untrusted: 'Pause before every command or patch and require approval.',
  'on-failure': 'Auto-run once, then ask if the command fails.',
  never: 'Run everything without asking for confirmation.',
};

export const REASONING_SUMMARY_OPTIONS: readonly ReasoningSummary[] = [
  'auto',
  'concise',
  'detailed',
  'none',
] as const;

export const REASONING_SUMMARY_DISPLAY: Record<ReasoningSummary, string> = {
  auto: 'Summaries auto',
  concise: 'Summaries concise',
  detailed: 'Summaries detailed',
  none: 'Summaries off',
};

export const REASONING_SUMMARY_HELP_TEXT: Record<ReasoningSummary, string> = {
  auto: 'Let Codex pick the right level of summary detail.',
  concise: 'Short reasoning summaries with key highlights.',
  detailed: 'Full reasoning summaries with additional detail.',
  none: 'Disable reasoning summaries entirely.',
};

type ComposerUpdate = Partial<ComposerTurnConfig>;

export interface ModelConfigSelectorProps {
  conversationId: string | null;
  composerConfig?: ComposerTurnConfig;
  disabled?: boolean;
  onUpdate?: (config: ComposerUpdate) => void;
}

const isModelName = (value: string | null | undefined): value is ModelName =>
  value === 'gpt-5.1' ||
  value === 'gpt-5.1-codex' ||
  value === 'gpt-5.1-codex-mini';

const isSandboxMode = (
  value: string | null | undefined
): value is SandboxMode =>
  SANDBOX_OPTIONS.includes((value ?? '') as SandboxMode);

const isApprovalMode = (
  value: string | null | undefined
): value is AskForApproval =>
  APPROVAL_OPTIONS.includes((value ?? '') as AskForApproval);

const isReasoningSummary = (
  value: string | null | undefined
): value is ReasoningSummary =>
  REASONING_SUMMARY_OPTIONS.includes((value ?? '') as ReasoningSummary);

export function ModelConfigSelector({
  conversationId,
  composerConfig: composerConfigProp,
  disabled: disabledProp,
  onUpdate,
}: ModelConfigSelectorProps) {
  const composerConfig = useMemo(
    () => composerConfigProp ?? createDefaultComposerConfig(),
    [composerConfigProp]
  );

  const selectedModel = useMemo<ModelName>(() => {
    const current = composerConfig.model;
    if (isModelName(current)) {
      return current;
    }
    return 'gpt-5.1-codex';
  }, [composerConfig.model]);

  const availableReasoningEfforts = useMemo(
    () => getAvailableReasoningEfforts(selectedModel),
    [selectedModel]
  );

  const selectedReasoningEffort = useMemo<ReasoningEffort>(() => {
    const candidate = composerConfig.reasoningEffort ?? 'medium';
    if (availableReasoningEfforts.includes(candidate)) {
      return candidate;
    }
    if (availableReasoningEfforts.includes('medium')) {
      return 'medium';
    }
    return availableReasoningEfforts[0] ?? 'medium';
  }, [composerConfig.reasoningEffort, availableReasoningEfforts]);

  const selectedSandbox = useMemo<SandboxMode>(() => {
    const current = composerConfig.sandbox;
    if (isSandboxMode(current)) {
      return current;
    }
    return 'read-only';
  }, [composerConfig.sandbox]);

  const selectedApproval = useMemo<AskForApproval>(() => {
    const current = composerConfig.approval;
    if (isApprovalMode(current)) {
      return current;
    }
    return 'on-request';
  }, [composerConfig.approval]);

  const selectedSummary = useMemo<ReasoningSummary>(() => {
    const current = composerConfig.summary;
    if (isReasoningSummary(current)) {
      return current;
    }
    return 'auto';
  }, [composerConfig.summary]);

  const disabled = Boolean(disabledProp || !conversationId);

  const emitUpdate = (updates: ComposerUpdate) => {
    if (!conversationId || !onUpdate) {
      return;
    }
    onUpdate(updates);
  };

  const handleModelChange = (model: ModelName) => {
    const availableEfforts = getAvailableReasoningEfforts(model);
    const current = composerConfig.reasoningEffort ?? 'medium';
    const normalizedEffort = availableEfforts.includes(current)
      ? current
      : availableEfforts.includes('medium')
        ? 'medium'
        : (availableEfforts[0] ?? 'medium');
    emitUpdate({ model, reasoningEffort: normalizedEffort });
  };

  const handleReasoningEffortChange = (effort: ReasoningEffort) => {
    emitUpdate({ reasoningEffort: effort });
  };

  const handleSandboxChange = (sandbox: SandboxMode) => {
    emitUpdate({ sandbox });
  };

  const handleApprovalChange = (approval: AskForApproval) => {
    emitUpdate({ approval });
  };

  const handleSummaryChange = (summary: ReasoningSummary) => {
    emitUpdate({ summary });
  };

  const containerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerQuery(
    containerRef as RefObject<HTMLElement>
  );

  if (!conversationId) {
    return null;
  }

  // Determine layout based on container width
  // Model selector is always visible; settings are in popover
  const showIconOnly =
    containerWidth !== null && containerWidth < COMPOSER_BREAKPOINTS.MEDIUM;

  // Model dropdown (always visible)
  const modelDropdown = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs h-8 px-2.5"
          disabled={disabled}
        >
          {MODEL_DISPLAY_NAMES[selectedModel]}
          <ChevronDownIcon className="size-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {Object.entries(MODEL_DISPLAY_NAMES).map(([value, label]) => (
          <DropdownMenuItem
            key={value}
            disabled={disabled}
            onSelect={() => handleModelChange(value as ModelName)}
          >
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const reasoningEffortDropdown = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs h-8 px-2.5"
          disabled={disabled}
        >
          {REASONING_EFFORT_DISPLAY[selectedReasoningEffort]}
          <ChevronDownIcon className="size-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {availableReasoningEfforts.map((effort) => (
          <DropdownMenuItem
            key={effort}
            disabled={disabled}
            onSelect={() => handleReasoningEffortChange(effort)}
          >
            {REASONING_EFFORT_DISPLAY[effort]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const approvalDropdown = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs h-8 px-2.5"
          disabled={disabled}
        >
          {APPROVAL_DISPLAY[selectedApproval]}
          <ChevronDownIcon className="size-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[280px]">
        {APPROVAL_OPTIONS.map((approval) => (
          <DropdownMenuItem
            key={approval}
            disabled={disabled}
            onSelect={() => handleApprovalChange(approval)}
          >
            <div className="flex flex-col">
              <span className="text-sm font-medium">
                {APPROVAL_DISPLAY[approval]}
              </span>
              <span className="text-xs text-muted-foreground">
                {APPROVAL_HELP_TEXT[approval]}
              </span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div ref={containerRef} className="flex items-center gap-2">
      {modelDropdown}
      {reasoningEffortDropdown}
      {approvalDropdown}
      <SettingsPopover
        reasoningSummary={selectedSummary}
        sandboxMode={selectedSandbox}
        disabled={disabled}
        iconOnly={showIconOnly}
        onReasoningSummaryChange={handleSummaryChange}
        onSandboxChange={handleSandboxChange}
      />
    </div>
  );
}
