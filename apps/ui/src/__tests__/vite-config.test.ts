/**
 * STORY-014 acceptance criterion 1: `pnpm --filter @neo-search/ui dev` MUST start the
 * Vite dev server and serve a page at localhost:5173.
 *
 * Booting Vite in a unit test is heavyweight; instead we assert the structural
 * guarantee that ENABLES the criterion: the Vite config declares port 5173 and
 * proxies /api to localhost:3001. STORY-019's E2E suite (Playwright) is what
 * actually drives the live dev server.
 *
 * We read the config as text rather than importing it because importing Vite
 * inside a jsdom environment trips an esbuild-on-worker invariant. The text
 * scan is sufficient for the structural guard the criterion requires; a real
 * runtime check is the job of `vite build` (passes) and Playwright (STORY-019).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const viteConfigPath = resolve(here, '..', '..', 'vite.config.ts');
const viteConfigSource = readFileSync(viteConfigPath, 'utf8');

describe('STORY-014 acceptance: Vite dev server config', () => {
  it('declares port 5173 — the documented dev URL', () => {
    expect(viteConfigSource).toMatch(/port:\s*5173/);
  });

  it('proxies /api/* to localhost:3001 (the API service per components/search-api.md)', () => {
    expect(viteConfigSource).toMatch(/'\/api'/);
    expect(viteConfigSource).toMatch(/http:\/\/localhost:3001/);
  });

  it('registers the React plugin (@vitejs/plugin-react)', () => {
    expect(viteConfigSource).toMatch(/@vitejs\/plugin-react/);
    expect(viteConfigSource).toMatch(/plugins:\s*\[\s*react\(\)/);
  });

  it('configures a build outDir of dist with sourcemaps', () => {
    expect(viteConfigSource).toMatch(/outDir:\s*'dist'/);
    expect(viteConfigSource).toMatch(/sourcemap:\s*true/);
  });
});
