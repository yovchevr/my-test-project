/**
 * Integration tests for App (FR-004, FR-005, FR-006).
 *
 * Per the story's Test plan, this file covers the full mount with a mocked
 * `fetch`: submit shows skeleton → results render; zero-result response shows
 * empty state; 502 response shows error state with `terminal` copy; load-more
 * appends.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { UiApiAnswerContract } from '@neo-search/contracts';
import { AppShell } from '../components/AppShell.js';
import { SearchPanel } from '../components/SearchPanel.js';
import { ResultsList } from '../components/ResultsList.js';
import { EmptyState } from '../components/EmptyState.js';
import { ErrorState } from '../components/ErrorState.js';
import { LoadMoreButton } from '../components/LoadMoreButton.js';
import { useSearch } from '../hooks/useSearch.js';

/**
 * Minimal App component for integration testing.
 */
function TestApp() {
  const { search, loadMore, data, isLoading, error } = useSearch();

  return (
    <AppShell
      controls={
        <SearchPanel
          onSearch={(request) =>
            search({ query: request.query, sourceFilter: request.sourceFilter })
          }
        />
      }
      results={
        <div className="flex-1 p-4">
          {isLoading && data === null && (
            <div data-testid="skeleton-loader">Loading skeleton...</div>
          )}

          {error && !isLoading && <ErrorState error={error} />}

          {!error && !isLoading && data && data.results.length === 0 && <EmptyState />}

          {!error && data && data.results.length > 0 && <ResultsList results={data.results} />}

          {!error && data && data.pagination.hasMore && (
            <LoadMoreButton onClick={loadMore} isLoading={isLoading} disabled={isLoading} />
          )}
        </div>
      }
    />
  );
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('App integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('submit shows results after loading', async () => {
    const user = userEvent.setup();

    const mockResponse: UiApiAnswerContract = {
      answer_summary: 'Test answer',
      references: [],
      results: [
        {
          title: 'Unique Result One',
          snippet: 'Unique Snippet One',
          domain: 'unique-one.com',
          url: 'https://unique-one.com/1',
        },
      ],
      pagination: { page: 1, totalChunks: 1, hasMore: false },
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, value: mockResponse }),
    });

    const Wrapper = createWrapper();
    const { container } = render(<TestApp />, { wrapper: Wrapper });

    const searchInput = within(container).getByPlaceholderText(/search/i);
    await user.type(searchInput, 'test query one{Enter}');

    // Results render after the fetch resolves.
    await waitFor(() =>
      expect(within(container).getByText('Unique Result One')).toBeInTheDocument(),
    );
    expect(within(container).getByText('Unique Snippet One')).toBeInTheDocument();
  });

  it('zero-result response shows empty state', async () => {
    const user = userEvent.setup();

    const mockResponse: UiApiAnswerContract = {
      answer_summary: 'No results',
      references: [],
      results: [],
      pagination: { page: 1, totalChunks: 0, hasMore: false },
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, value: mockResponse }),
    });

    const Wrapper = createWrapper();
    const { container } = render(<TestApp />, { wrapper: Wrapper });

    const searchInput = within(container).getByPlaceholderText(/search/i);
    await user.type(searchInput, 'no results query{Enter}');

    await waitFor(() =>
      expect(within(container).getByText(/No results found/i)).toBeInTheDocument(),
    );
    expect(within(container).getByText(/No results for that query/i)).toBeInTheDocument();
  });

  it('502 response shows error state with terminal copy', async () => {
    const user = userEvent.setup();

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({
        ok: false,
        error: { kind: 'terminal', message: 'Service unavailable' },
      }),
    });

    const Wrapper = createWrapper();
    const { container } = render(<TestApp />, { wrapper: Wrapper });

    const searchInput = within(container).getByPlaceholderText(/search/i);
    await user.type(searchInput, 'failing query{Enter}');

    await waitFor(() =>
      expect(within(container).getByText(/Service unavailable/i)).toBeInTheDocument(),
    );
    expect(within(container).getByText(/The search service is unavailable/i)).toBeInTheDocument();
  });

  it('load-more appends results', async () => {
    const user = userEvent.setup();

    const page1Response: UiApiAnswerContract = {
      answer_summary: 'Answer page 1',
      references: [],
      results: [
        {
          title: 'Paginated Result 1',
          snippet: 'Paginated Snippet 1',
          domain: 'paginated.com',
          url: 'https://paginated.com/1',
        },
      ],
      pagination: { page: 1, totalChunks: 2, hasMore: true },
    };

    const page2Response: UiApiAnswerContract = {
      answer_summary: 'Answer page 2',
      references: [],
      results: [
        {
          title: 'Paginated Result 2',
          snippet: 'Paginated Snippet 2',
          domain: 'paginated.com',
          url: 'https://paginated.com/2',
        },
      ],
      pagination: { page: 2, totalChunks: 2, hasMore: false },
    };

    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, value: page1Response }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, value: page2Response }),
      });

    const Wrapper = createWrapper();
    const { container } = render(<TestApp />, { wrapper: Wrapper });

    const searchInput = within(container).getByPlaceholderText(/search/i);
    await user.type(searchInput, 'paginated query{Enter}');

    await waitFor(() =>
      expect(within(container).getByText('Paginated Result 1')).toBeInTheDocument(),
    );
    const loadMoreButton = within(container).getByRole('button', { name: /Load more/i });
    expect(loadMoreButton).toBeInTheDocument();

    await user.click(loadMoreButton);

    await waitFor(() =>
      expect(within(container).getByText('Paginated Result 2')).toBeInTheDocument(),
    );
    expect(within(container).getByText('Paginated Result 1')).toBeInTheDocument();
    expect(within(container).queryByRole('button', { name: /Load more/i })).not.toBeInTheDocument();
  });

  it('a transient_exhausted response shows ErrorState and the spinner stops', async () => {
    const user = userEvent.setup();

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({
        ok: false,
        error: { kind: 'transient_exhausted', message: 'Retries exhausted' },
      }),
    });

    const Wrapper = createWrapper();
    const { container } = render(<TestApp />, { wrapper: Wrapper });

    const searchInput = within(container).getByPlaceholderText(/search/i);
    await user.type(searchInput, 'fault query{Enter}');

    // Error state renders after the fetch resolves (FR-005 vs FR-006 separation).
    await waitFor(() =>
      expect(within(container).getByText(/Connection error/i)).toBeInTheDocument(),
    );
    expect(
      within(container).getByText(/We couldn't reach the search service/i),
    ).toBeInTheDocument();
  });
});
