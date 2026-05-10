/**
 * `@neo-search/ui` — public surface of the browser-facing app.
 *
 * The app's runtime entry point is `src/main.tsx`; this `index.ts` re-exports the
 * shell components so test code (and any future story tooling) can consume them
 * without reaching into deep paths.
 */
export { AppShell } from './components/AppShell.js';
export type { AppShellProps } from './components/AppShell.js';
