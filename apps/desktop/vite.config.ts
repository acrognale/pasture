import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => {
  const isDebug = !!process.env.TAURI_ENV_DEBUG;
  const platform = process.env.TAURI_ENV_PLATFORM;
  const target: 'chrome111' | 'safari17' =
    platform === 'windows' ? 'chrome111' : 'safari17';
  const minify: false | 'esbuild' = isDebug ? false : 'esbuild';
  const isAppDev = command === 'serve' && !process.env.STORYBOOK;

  return {
    plugins: [
      tanstackRouter({
        target: 'react',
      }),
      react({
        babel: {
          plugins: [['babel-plugin-react-compiler']],
        },
      }),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '~': path.resolve(__dirname, './src'),
      },
      dedupe: ['react', 'react-dom'],
    },
    clearScreen: false,
    optimizeDeps: {
      include: ['react', 'react-dom'],
    },
    envPrefix: ['VITE_', 'TAURI_'],
    server: isAppDev
      ? {
          host: '127.0.0.1',
          port: 5173,
          strictPort: true,
        }
      : undefined,
    build: {
      target,
      minify,
      sourcemap: isDebug,
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/setupTests.ts'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
      },
      exclude: ['codex/**', 'node_modules/**'],
    },
  };
});
