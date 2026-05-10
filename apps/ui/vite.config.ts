/**
 * Vite config for `apps/ui`. Wires React, Tailwind/PostCSS, and the dev-server proxy.
 *
 * Why a `/api` proxy: STORY-014 stands up the shell only — no real API calls — but the
 * proxy keeps the seam honest for STORY-015..STORY-017, which will issue fetches against
 * the relative path `/api/*`. The API is owned by `services/api` (port 3001 per
 * `.design/components/search-api.md`); during `pnpm dev` the proxy forwards there.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
