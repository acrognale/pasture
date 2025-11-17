import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ShortcutProvider } from '~/keyboard/ShortcutProvider';

import { router } from './app-router';
import './index.css';
import { createAppQueryClient } from './lib/queryClient';

const queryClient = createAppQueryClient();

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element not found');
}

const root = createRoot(rootEl);

root.render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ShortcutProvider>
        <RouterProvider router={router} />
      </ShortcutProvider>
    </QueryClientProvider>
  </StrictMode>
);
