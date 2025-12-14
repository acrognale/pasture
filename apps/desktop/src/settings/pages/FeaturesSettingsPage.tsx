import { Switch } from '~/components/ui/switch';
import { useWorkspaceComposerDefaults } from '../hooks/useWorkspaceComposerDefaults';

type FeaturesSettingsPageProps = {
  workspacePath: string;
};

export function FeaturesSettingsPage({
  workspacePath,
}: FeaturesSettingsPageProps) {
  const { defaults, disabled, updateSetting } =
    useWorkspaceComposerDefaults(workspacePath);
  const webSearchEnabled = defaults.webSearchEnabled ?? false;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-foreground">Allow web search</span>
          <span className="text-xs text-muted-foreground">
            Let Codex use its built-in web_search tool. Applies to new threads.
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
  );
}
