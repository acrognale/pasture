import { listen } from '@tauri-apps/api/event';
import { relaunch } from '@tauri-apps/plugin-process';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { UpdateInfo } from '~/codex.gen/UpdateInfo';
import { Codex } from '~/codex/client';
import { isTauriEnvironment } from '~/codex/events';

import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

export function UpdateDialog() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [installing, setInstalling] = useState(false);

  const checkForUpdate = useCallback(async (showNoUpdate: boolean) => {
    try {
      const result = await Codex.checkForUpdate();
      if (result) {
        setUpdate(result);
        setOpen(true);
      } else if (showNoUpdate) {
        toast.success("You're up to date!", {
          description: 'Pasture is running the latest version.',
        });
      }
    } catch (err) {
      console.error('Update check failed:', err);
      if (showNoUpdate) {
        toast.error('Update check failed', {
          description: String(err),
        });
      }
    }
  }, []);

  useEffect(() => {
    if (!isTauriEnvironment()) {
      return;
    }

    // Check for updates on app start (delayed to avoid cascading renders)
    const timeoutId = setTimeout(() => {
      void checkForUpdate(false);
    }, 0);

    // Listen for menu-triggered update checks
    const unlistenPromise = listen('update:check-requested', () => {
      void checkForUpdate(true);
    });

    return () => {
      clearTimeout(timeoutId);
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [checkForUpdate]);

  async function handleInstall() {
    setInstalling(true);
    try {
      await Codex.installUpdate();
      toast.success('Update installed', {
        description: 'Restarting...',
      });
      // Small delay to show the toast
      await new Promise((resolve) => setTimeout(resolve, 500));
      await relaunch();
    } catch (err) {
      console.error('Update install failed:', err);
      toast.error('Update failed', {
        description: String(err),
      });
      setInstalling(false);
    }
  }

  if (!isTauriEnvironment()) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Available</DialogTitle>
          <DialogDescription>
            Version {update?.version} is available. You are currently running{' '}
            {update?.current_version}.
          </DialogDescription>
        </DialogHeader>
        {update?.body && (
          <div className="text-muted-foreground max-h-48 overflow-y-auto rounded border p-3 text-sm">
            {update.body}
          </div>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={installing}
          >
            Later
          </Button>
          <Button onClick={() => void handleInstall()} disabled={installing}>
            {installing ? 'Installing...' : 'Install & Restart'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
