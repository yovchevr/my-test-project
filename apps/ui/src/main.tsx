/**
 * `apps/ui/src/main.tsx` — React root for the neo-search UI (STORY-016).
 *
 * Mounts `AppShell` with the `SearchPanel` and wires the results list, empty
 * state, error state, and load-more affordance (FR-004, FR-005, FR-006).
 *
 * The `QueryClientProvider` wraps the app so `useSearch` can use React Query's
 * mutation hook. Per `tech-stack.md`, React Query is the chosen state-sync tool
 * for API calls.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SearchRequestContract } from '@neo-search/contracts';
import { AppShell } from './components/AppShell.js';
import { SearchPanel } from './components/SearchPanel.js';
import { ResultsList } from './components/ResultsList.js';
import { EmptyState } from './components/EmptyState.js';
import { ErrorState } from './components/ErrorState.js';
import { LoadMoreButton } from './components/LoadMoreButton.js';
import { useSearch } from './hooks/useSearch.js';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('Missing #root element in index.html');
}

/**
 * App — top-level component that composes the search panel, results area, and
 * progressive-loading affordance.
 *
 * Per the story's Scope, this component state-drives the results-list vs.
 * empty-state vs. error-state rendering (FR-005). The initial-fetch skeleton
 * is visible from submit until the first response arrives (FR-006 acceptance
 * criterion i).
 */
function App() {
  const { search, loadMore, data, isLoading, error } = useSearch();

  const handleSearch = (request: SearchRequestContract) => {
    search({ query: request.query, sourceFilter: request.sourceFilter });
  };

  return (
    <AppShell
      controls={<SearchPanel onSearch={handleSearch} />}
      results={
        <div className="flex-1 p-4">
          {/* Initial-fetch skeleton: visible during the first request */}
          {isLoading && data === null && (
            <div className="flex flex-col gap-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-lg bg-gray-200 p-4 shadow-md"
                  style={{ height: '120px' }}
                />
              ))}
            </div>
          )}

          {/* Error state: network error or structured { ok: false, error } */}
          {error && !isLoading && <ErrorState error={error} />}

          {/* Empty state: zero-result successful query */}
          {!error && !isLoading && data && data.results.length === 0 && <EmptyState />}

          {/* Results list: N > 0 results */}
          {!error && data && data.results.length > 0 && <ResultsList results={data.results} />}

          {/* Load-more button: visible when pagination.hasMore */}
          {!error && data && data.pagination.hasMore && (
            <LoadMoreButton onClick={loadMore} isLoading={isLoading} disabled={isLoading} />
          )}
        </div>
      }
    />
  );
}

createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
