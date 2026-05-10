/**
 * `@neo-search/ui` — public surface of the browser-facing app.
 *
 * The app's runtime entry point is `src/main.tsx`; this `index.ts` re-exports the
 * shell components so test code (and any future story tooling) can consume them
 * without reaching into deep paths.
 */
export { AppShell } from './components/AppShell.js';
export type { AppShellProps } from './components/AppShell.js';

// STORY-015 — search controls + source-filter bar (FR-002, FR-003).
export { SearchBar } from './components/SearchBar.js';
export type { SearchBarProps } from './components/SearchBar.js';
export { SourceFilterBar } from './components/SourceFilterBar.js';
export type { SourceFilterBarProps } from './components/SourceFilterBar.js';
export { SearchPanel } from './components/SearchPanel.js';
export type { SearchPanelProps } from './components/SearchPanel.js';
