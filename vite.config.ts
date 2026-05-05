import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  const isAnalyze = mode === 'analyze';

  return {
    plugins: [
      tanstackRouter(),
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
    },
  };
});
