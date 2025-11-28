import { Outlet, createRootRoute } from '@tanstack/react-router';
import { Toaster } from 'sonner';
import { UpdateDialog } from '~/components/UpdateDialog';

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <div className="h-screen w-screen overflow-hidden">
      <Outlet />
      <UpdateDialog />
      <Toaster position="bottom-right" />
    </div>
  );
}
