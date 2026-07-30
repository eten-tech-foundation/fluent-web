import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';

// @sillsdev/machine (pulled in by the Lynx USFM PoC) imports Node built-ins at
// module scope; its package `browser` field maps them to empty modules, which
// leaves `fileURLToPath(import.meta.url)` undefined at load time in the
// browser. Alias the four ids to inert shims for browser builds only — vitest
// runs in Node, where the real modules must stay available.
const nodeShims = fileURLToPath(new URL('./src/features/lynx/lib/node-shims.ts', import.meta.url));

export default defineConfig(({ mode }) => {
  const isAnalyze = mode === 'analyze';
  const isTest = mode === 'test' || process.env.VITEST != null;

  return {
    plugins: [
      tanstackRouter({ autoCodeSplitting: true }),
      react(),
      tailwindcss(),
      isAnalyze &&
        visualizer({
          open: true,
          filename: 'dist/stats.html',
          gzipSize: true,
          brotliSize: true,
        }),
    ].filter(Boolean),

    resolve: {
      tsconfigPaths: true, // ← native replacement for vite-tsconfig-paths plugin
      alias: isTest
        ? undefined
        : [
            { find: /^(?:node:)?fs\/promises$/, replacement: nodeShims },
            { find: /^(?:node:)?fs$/, replacement: nodeShims },
            { find: /^(?:node:)?path$/, replacement: nodeShims },
            { find: /^(?:node:)?url$/, replacement: nodeShims },
          ],
    },

    build: {
      sourcemap: !isAnalyze,
      rollupOptions: {
        output: {
          manualChunks: id => {
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
              return 'react-vendor';
            }
            if (id.includes('node_modules/@tanstack/react-router')) {
              return 'tanstack';
            }
            if (
              id.includes('node_modules/@radix-ui/react-slot') ||
              id.includes('node_modules/class-variance-authority') ||
              id.includes('node_modules/clsx') ||
              id.includes('node_modules/tailwind-merge')
            ) {
              return 'ui-libs';
            }
          },
        },
      },
    },

    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      // Dummy values so src/lib/config.ts env validation passes under vitest.
      env: {
        VITE_API_URL: 'https://api.test.local',
        VITE_AQUIFER_API_URL: 'https://aquifer.test.local',
        VITE_AQUIFER_API_KEY: 'test-aquifer-key',
        VITE_YOUVERSION_API_URL: 'https://youversion.test.local',
        VITE_YOUVERSION_API_KEY: 'test-youversion-key',
        VITE_BETTER_AUTH_URL: 'https://auth.test.local',
        VITE_ENVIRONMENT: 'production',
        VITE_APP_INSIGHTS_CONNECTION_STRING: '',
      },
    },
  };
});
