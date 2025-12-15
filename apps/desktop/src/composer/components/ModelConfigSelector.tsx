import type {
  AskForApproval,
  ReasoningEffort,
  ReasoningSummary,
  SandboxMode,
} from '@pasture/protocol';
import { ChevronDownIcon } from 'lucide-react';
import { RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { useSidebar } from '~/components/ui/sidebar';
import { Switch } from '~/components/ui/switch';
import { useConversationProviderLock } from '~/conversation/store/hooks';
import {
  COMPOSER_BREAKPOINTS,
  useContainerQuery,
} from '~/lib/hooks/useContainerQuery';
import {
  inferModelProviderId,
  normalizeModelProviderId,
} from '~/lib/providerInference';
import { cn } from '~/lib/utils';

import {
  MODEL_DISPLAY_NAMES,
  MODEL_OPTIONS,
  type ModelName,
  getAvailableReasoningEfforts,
  getReasoningControlKind,
  normalizeReasoningEffort,
} from '../model-options';
import {
  MODELS_BY_PROVIDER,
  PROVIDER_DISPLAY_NAMES,
} from '../model-provider-constants';
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
  const providerLock = useConversationProviderLock(conversationId);
  const lockedProviderId = useMemo(
    () => normalizeModelProviderId(providerLock.lockedModelProviderId),
    [providerLock.lockedModelProviderId]
  );

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

  const usesBinaryReasoning = useMemo(
    () => getReasoningControlKind(selectedModel) === 'binary',
    [selectedModel]
  );

  const thinkingEnabled = useMemo(() => {
    if (!usesBinaryReasoning) return false;
    const current = composerConfig.reasoningEffort ?? undefined;
    if (!current) return true;
    return current !== 'none';
  }, [composerConfig.reasoningEffort, usesBinaryReasoning]);

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
    if (lockedProviderId) {
      const targetProviderId = inferModelProviderId(model);
      if (targetProviderId && targetProviderId !== lockedProviderId) {
        toast.info('Provider locked', {
          description: 'To switch providers, start a new thread.',
        });
        return;
      }
    }

    const usesBinary = getReasoningControlKind(model) === 'binary';
    if (usesBinary) {
      const current = composerConfig.reasoningEffort ?? 'medium';
      emitUpdate({
        model,
        reasoningEffort: current === 'none' ? 'none' : 'medium',
      });
      return;
    }

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

  const handleThinkingChange = (enabled: boolean) => {
    emitUpdate({ reasoningEffort: enabled ? 'medium' : 'none' });
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

  // For models with binary reasoning controls, normalize any existing value to either `none`
  // (thinking off) or `medium` (thinking on) so the UI and sent config stay consistent.
  useEffect(() => {
    if (!usesBinaryReasoning) return;
    const current = composerConfig.reasoningEffort ?? null;
    const normalized = current === 'none' ? 'none' : 'medium';
    if (current !== normalized && conversationId && onUpdate) {
      onUpdate({ reasoningEffort: normalized });
    }
  }, [
    composerConfig.reasoningEffort,
    conversationId,
    onUpdate,
    usesBinaryReasoning,
  ]);

  if (!conversationId) {
    return null;
  }

  const sidebarConsumesSpace =
    sidebarOpen && fallbackViewportWidth > SIDEBAR_AUTO_COLLAPSE_WIDTH;
  const width = fallbackViewportWidth;
  const showIconOnly = width < COMPOSER_BREAKPOINTS.MEDIUM;
  const approvalsBreakpoint = sidebarConsumesSpace
    ? BASE_APPROVAL_WIDTH + LEFT_SIDEBAR_WIDTH
    : BASE_APPROVAL_WIDTH;
  const reasoningBreakpoint = approvalsBreakpoint - REASONING_OFFSET;
  const approvalsInSettings = width < approvalsBreakpoint;
  const reasoningEffortInSettings = width < reasoningBreakpoint;

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
        {lockedProviderId ? (
          <>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Provider locked to {PROVIDER_DISPLAY_NAMES[lockedProviderId]}. To
              switch providers, start a new thread.
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        ) : null}

        <DropdownMenuLabel className="text-xs text-muted-foreground">
          OpenAI
        </DropdownMenuLabel>
        {MODELS_BY_PROVIDER.openaiModels.map((value) => {
          const label = MODEL_DISPLAY_NAMES[value];
          const incompatible =
            lockedProviderId != null &&
            inferModelProviderId(value) !== lockedProviderId;
          return (
            <DropdownMenuItem
              key={value}
              disabled={disabled || incompatible}
              onSelect={() => handleModelChange(value)}
            >
              {label}
            </DropdownMenuItem>
          );
        })}

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Anthropic
        </DropdownMenuLabel>
        {MODELS_BY_PROVIDER.anthropicModels.map((value) => {
          const label = MODEL_DISPLAY_NAMES[value];
          const incompatible =
            lockedProviderId != null &&
            inferModelProviderId(value) !== lockedProviderId;
          return (
            <DropdownMenuItem
              key={value}
              disabled={disabled || incompatible}
              onSelect={() => handleModelChange(value)}
            >
              {label}
            </DropdownMenuItem>
          );
        })}
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

  const thinkingToggle = (
    <div
      className={cn(
        'flex items-center gap-2 h-8 px-2.5 rounded-md',
        !disabled && 'hover:bg-muted'
      )}
    >
      <span className="text-xs font-medium">Thinking</span>
      <Switch
        checked={thinkingEnabled}
        disabled={disabled}
        onCheckedChange={(checked) => handleThinkingChange(checked === true)}
        aria-label="Thinking"
      />
    </div>
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
      {!reasoningEffortInSettings &&
        (usesBinaryReasoning ? thinkingToggle : reasoningEffortDropdown)}
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
        thinkingEnabled={
          usesBinaryReasoning && reasoningEffortInSettings
            ? thinkingEnabled
            : undefined
        }
        onThinkingChange={
          usesBinaryReasoning && reasoningEffortInSettings
            ? handleThinkingChange
            : undefined
        }
        reasoningEffort={
          !usesBinaryReasoning && reasoningEffortInSettings
            ? selectedReasoningEffort
            : undefined
        }
        availableReasoningEfforts={
          !usesBinaryReasoning && reasoningEffortInSettings
            ? availableReasoningEfforts
            : undefined
        }
        onReasoningEffortChange={
          !usesBinaryReasoning && reasoningEffortInSettings
            ? handleReasoningEffortChange
            : undefined
        }
        onReasoningSummaryChange={handleSummaryChange}
        onSandboxChange={handleSandboxChange}
      />
    </div>
  );
}
