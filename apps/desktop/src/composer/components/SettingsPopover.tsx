import { ChevronDownIcon, SettingsIcon } from 'lucide-react';
import type { ReasoningSummary, SandboxMode } from '~/codex.gen';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';

import {
  REASONING_SUMMARY_DISPLAY,
  REASONING_SUMMARY_HELP_TEXT,
  REASONING_SUMMARY_OPTIONS,
  SANDBOX_DISPLAY,
  SANDBOX_OPTIONS,
} from './ModelConfigSelector';

type SettingsPopoverProps = {
  reasoningSummary: ReasoningSummary;
  sandboxMode: SandboxMode;
  disabled: boolean;
  iconOnly?: boolean;
  onReasoningSummaryChange: (summary: ReasoningSummary) => void;
  onSandboxChange: (sandbox: SandboxMode) => void;
};

type ConfigSectionProps = {
  label: string;
  value: string;
  disabled: boolean;
  options: readonly string[];
  displayMap: Record<string, string>;
  helpTextMap?: Record<string, string>;
  onSelect: (value: string) => void;
};

function ConfigSection({
  label,
  value,
  disabled,
  options,
  displayMap,
  helpTextMap,
  onSelect,
}: ConfigSectionProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-between text-xs h-9 font-normal"
            disabled={disabled}
          >
            <span className="truncate">{displayMap[value]}</span>
            <ChevronDownIcon className="size-3 opacity-50 shrink-0 ml-2" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[280px]">
          {options.map((option) => (
            <DropdownMenuItem
              key={option}
              disabled={disabled}
              onSelect={() => onSelect(option)}
            >
              {helpTextMap ? (
                <div className="flex flex-col">
                  <span className="text-sm font-medium">
                    {displayMap[option]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {helpTextMap[option]}
                  </span>
                </div>
              ) : (
                <span className="text-sm">{displayMap[option]}</span>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function SettingsPopover({
  reasoningSummary,
  sandboxMode,
  disabled,
  iconOnly = false,
  onReasoningSummaryChange,
  onSandboxChange,
}: SettingsPopoverProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {iconOnly ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            disabled={disabled}
            title="Model settings"
          >
            <SettingsIcon className="size-4" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs h-8 px-2.5"
            disabled={disabled}
          >
            <SettingsIcon className="size-3" />
            Settings
            <ChevronDownIcon className="size-3 opacity-50" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[320px] p-4">
        <div className="space-y-4">
          <ConfigSection
            label="Reasoning Summary"
            value={reasoningSummary}
            disabled={disabled}
            options={REASONING_SUMMARY_OPTIONS}
            displayMap={REASONING_SUMMARY_DISPLAY}
            helpTextMap={REASONING_SUMMARY_HELP_TEXT}
            onSelect={(value) =>
              onReasoningSummaryChange(value as ReasoningSummary)
            }
          />

          <ConfigSection
            label="Sandbox Mode"
            value={sandboxMode}
            disabled={disabled}
            options={SANDBOX_OPTIONS}
            displayMap={SANDBOX_DISPLAY}
            onSelect={(value) => onSandboxChange(value as SandboxMode)}
          />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
