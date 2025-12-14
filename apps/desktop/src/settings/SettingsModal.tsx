import { useState } from 'react';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';

import { AuthenticationSettingsPage } from './pages/AuthenticationSettingsPage';
import { DefaultsSettingsPage } from './pages/DefaultsSettingsPage';
import { FeaturesSettingsPage } from './pages/FeaturesSettingsPage';

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
  const [page, setPage] = useState<SettingsPage>('features');

  const pages: { id: SettingsPage; label: string }[] = [
    { id: 'features', label: 'Features' },
    { id: 'defaults', label: 'Defaults' },
    { id: 'authentication', label: 'Authentication' },
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
              <FeaturesSettingsPage workspacePath={workspacePath} />
            ) : null}

            {page === 'authentication' ? <AuthenticationSettingsPage /> : null}

            {page === 'defaults' ? (
              <DefaultsSettingsPage workspacePath={workspacePath} />
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
