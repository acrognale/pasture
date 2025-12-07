import { Outlet, createRootRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { Toaster } from 'sonner';
import { UpdateDialog } from '~/components/UpdateDialog';
import { warmUpNotificationPermission } from '~/notifications/turns';

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  useEffect(() => {
    void warmUpNotificationPermission();
  }, []);

  return (
    <div className="h-screen w-screen overflow-hidden">
      <Outlet />
      <UpdateDialog />
      <Toaster position="bottom-right" />
    </div>
  );
}
