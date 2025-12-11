import type {
  AskForApproval,
  ReasoningEffort,
  ReasoningSummary,
  SandboxMode,
} from '@pasture/protocol';
import { ChevronDownIcon } from 'lucide-react';
import { RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { useSidebar } from '~/components/ui/sidebar';
import {
  COMPOSER_BREAKPOINTS,
  useContainerQuery,
} from '~/lib/hooks/useContainerQuery';

import {
  MODEL_DISPLAY_NAMES,
  MODEL_OPTIONS,
  type ModelName,
  getAvailableReasoningEfforts,
  normalizeReasoningEffort,
} from '../model-options';
import { type ComposerTurnConfig, createDefaultComposerConfig } from '../types';
import { SettingsPopover } from './SettingsPopover';

export const REASONING_EFFORT_DISPLAY: Record<ReasoningEffort, string> = {
  none: 'Reasoning off',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
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

const SIDEBAR_AUTO_COLLAPSE_WIDTH = 876;
const LEFT_SIDEBAR_WIDTH = 288; // 18rem
const BASE_APPROVAL_WIDTH = 600;
const REASONING_OFFSET = 65;

const isModelName = (value: string | null | undefined): value is ModelName =>
  value != null && MODEL_OPTIONS.includes(value as ModelName);

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
    return 'gpt-5.2';
  }, [composerConfig.model]);

  const availableReasoningEfforts = useMemo(
    () => getAvailableReasoningEfforts(selectedModel),
    [selectedModel]
  );

  const selectedReasoningEffort = useMemo<ReasoningEffort>(() => {
    return normalizeReasoningEffort(
      selectedModel,
      composerConfig.reasoningEffort ?? undefined
    );
  }, [composerConfig.reasoningEffort, selectedModel]);

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
  useContainerQuery(containerRef as RefObject<HTMLElement>);

  const sidebarOpen = useSidebar().open;

  const [viewportWidth, setViewportWidth] = useState<number | null>(null);

  useEffect(() => {
    const updateWidth = () => setViewportWidth(window.innerWidth);
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const fallbackViewportWidth = viewportWidth ?? Number.POSITIVE_INFINITY;

  if (!conversationId) {
    return null;
  }

  // Sidebar only reduces available width while it is open and wider than its auto-collapse threshold.
  const sidebarConsumesSpace =
    sidebarOpen && fallbackViewportWidth > SIDEBAR_AUTO_COLLAPSE_WIDTH;

  const width = fallbackViewportWidth;

  // Determine layout based on viewport width (keeps dropdowns visible on larger screens).
  const showIconOnly = width < COMPOSER_BREAKPOINTS.MEDIUM;

  const approvalsBreakpoint = sidebarConsumesSpace
    ? BASE_APPROVAL_WIDTH + LEFT_SIDEBAR_WIDTH
    : BASE_APPROVAL_WIDTH;
  const reasoningBreakpoint = approvalsBreakpoint - REASONING_OFFSET;

  // Move approvals into the settings popover when space is constrained.
  const approvalsInSettings = width < approvalsBreakpoint;

  // At an additional 65px reduction also move reasoning effort.
  const reasoningEffortInSettings = width < reasoningBreakpoint;

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
      {!reasoningEffortInSettings && reasoningEffortDropdown}
      {!approvalsInSettings && approvalDropdown}
      <SettingsPopover
        reasoningSummary={selectedSummary}
        sandboxMode={selectedSandbox}
        disabled={disabled}
        iconOnly={showIconOnly}
        approval={approvalsInSettings ? selectedApproval : undefined}
        onApprovalChange={
          approvalsInSettings ? handleApprovalChange : undefined
        }
        reasoningEffort={
          reasoningEffortInSettings ? selectedReasoningEffort : undefined
        }
        availableReasoningEfforts={
          reasoningEffortInSettings ? availableReasoningEfforts : undefined
        }
        onReasoningEffortChange={
          reasoningEffortInSettings ? handleReasoningEffortChange : undefined
        }
        onReasoningSummaryChange={handleSummaryChange}
        onSandboxChange={handleSandboxChange}
      />
    </div>
  );
}
