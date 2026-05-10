/**
 * `apps/ui/src/main.tsx` — React root for the neo-search UI.
 *
 * Mounts `AppShell` with empty slots; STORY-015..STORY-017 will replace those slots
 * with concrete components. The shell intentionally renders without controls/results
 * here so STORY-014's acceptance criteria (sticky top bar, product title, one global
 * action, 320px responsive floor) can be validated end-to-end without coupling to
 * downstream stories.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell } from './components/AppShell.js';
import './index.css';

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('Missing #root element in index.html');
}

createRoot(rootElement).render(
  <React.StrictMode>
    <AppShell />
  </React.StrictMode>,
);
