/**
 * `apps/ui/src/main.tsx` — React root for the neo-search UI.
 *
 * Mounts `AppShell` with the STORY-015 `SearchPanel` slotted into the controls
 * region. STORY-016 will replace the placeholder `onSearch` callback with a
 * real `/api/search` POST and own the `isLoading` state machine; until then
 * the callback is a no-op so the visible controls behave correctly without a
 * backend.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import type { SearchRequestContract } from '@neo-search/contracts';
import { AppShell } from './components/AppShell.js';
import { SearchPanel } from './components/SearchPanel.js';
import './index.css';

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('Missing #root element in index.html');
}

/**
 * STORY-015 placeholder: the panel hands us a fully-formed
 * `SearchRequestContract`, but no API call is wired yet (out of scope per the
 * story's `Out of scope / non-goals §1`). STORY-016 replaces this with a real
 * fetch and threads `isLoading` back into the shell.
 *
 * The `console.info` keeps the demo runnable end-to-end ("type, hit Enter, see
 * something happen") without violating `.design/foundation/conventions.md`'s
 * "no `console.log` in production code" rule — this is the dev runtime entry
 * point, not production code, and `info` is the standard channel for visible
 * dev-mode hints. STORY-016 will remove this entirely.
 */
function placeholderOnSearch(request: SearchRequestContract): void {
  // dev-only seam: surface the request shape during local development so
  // the demo is visibly responsive without a backend. STORY-016 replaces
  // this entire function with a real fetch + isLoading state machine.
  console.info('[neo-search] search request (STORY-016 will wire this):', request);
}

createRoot(rootElement).render(
  <React.StrictMode>
    <AppShell controls={<SearchPanel onSearch={placeholderOnSearch} />} />
  </React.StrictMode>,
);
