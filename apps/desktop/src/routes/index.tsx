import { createFileRoute } from '@tanstack/react-router';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect } from 'react';
import { WorkspaceLaunchpad } from '~/components/WorkspaceLaunchpad';

export const Route = createFileRoute('/')({
  component: RouteComponent,
});

function RouteComponent() {
  useEffect(() => {
    const unlistenPromise = listen('app:close-requested', () => {
      void getCurrentWindow().close();
    });

    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  return <WorkspaceLaunchpad />;
}
