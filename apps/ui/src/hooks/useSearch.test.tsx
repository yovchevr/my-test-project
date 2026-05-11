/**
 * Unit tests for useSearch hook (FR-004, FR-006).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { UiApiAnswerContract } from '@neo-search/contracts';
import { useSearch } from './useSearch.js';
import * as apiClient from '../api-client.js';

// Wrapper for React Query provider.
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

describe('useSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards the SearchRequestContract shape to postSearch', async () => {
    const mockResponse: UiApiAnswerContract = {
      answer_summary: 'Test answer',
      references: [],
      results: [
        {
          title: 'Result 1',
          snippet: 'Snippet 1',
          domain: 'example.com',
          url: 'https://example.com/1',
        },
      ],
      pagination: { page: 1, totalChunks: 1, hasMore: false },
    };

    const postSearchSpy = vi
      .spyOn(apiClient, 'postSearch')
      .mockResolvedValue({ ok: true, value: mockResponse });

    const { result } = renderHook(() => useSearch(), { wrapper: createWrapper() });

    result.current.search({ query: 'test query', sourceFilter: 'LIVE' });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(postSearchSpy).toHaveBeenCalledWith({
      query: 'test query',
      sourceFilter: 'LIVE',
      page: 1,
    });
    expect(result.current.data?.results).toHaveLength(1);
  });

  it('appends results on loadMore (FR-006 acceptance criterion a)', async () => {
    const page1Response: UiApiAnswerContract = {
      answer_summary: 'Answer page 1',
      references: [],
      results: [
        {
          title: 'Result 1',
          snippet: 'Snippet 1',
          domain: 'example.com',
          url: 'https://example.com/1',
        },
      ],
      pagination: { page: 1, totalChunks: 2, hasMore: true },
    };

    const page2Response: UiApiAnswerContract = {
      answer_summary: 'Answer page 2',
      references: [],
      results: [
        {
          title: 'Result 2',
          snippet: 'Snippet 2',
          domain: 'example.com',
          url: 'https://example.com/2',
        },
      ],
      pagination: { page: 2, totalChunks: 2, hasMore: false },
    };

    const postSearchSpy = vi
      .spyOn(apiClient, 'postSearch')
      .mockResolvedValueOnce({ ok: true, value: page1Response })
      .mockResolvedValueOnce({ ok: true, value: page2Response });

    const { result } = renderHook(() => useSearch(), { wrapper: createWrapper() });

    result.current.search({ query: 'test query', sourceFilter: 'LIVE' });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data?.results).toHaveLength(1);
    expect(result.current.data?.pagination.hasMore).toBe(true);
    expect(result.current.data).not.toBeNull();

    result.current.loadMore();

    await waitFor(() => expect(postSearchSpy).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).not.toBeNull();
    const data = result.current.data!;
    expect(data.results).toHaveLength(2);
    expect(data.results[0]!.title).toBe('Result 1');
    expect(data.results[1]!.title).toBe('Result 2');
    expect(data.pagination.hasMore).toBe(false);
  });

  it('surfaces errors as the error state', async () => {
    const errorResponse = {
      ok: false as const,
      error: { kind: 'terminal' as const, message: 'Service unavailable' },
    };

    vi.spyOn(apiClient, 'postSearch').mockResolvedValue(errorResponse);

    const { result } = renderHook(() => useSearch(), { wrapper: createWrapper() });

    result.current.search({ query: 'test query', sourceFilter: 'LIVE' });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toEqual({ kind: 'terminal', message: 'Service unavailable' });
    expect(result.current.data).toBeNull();
  });

  it('replaces data on a new search (page 1)', async () => {
    const firstResponse: UiApiAnswerContract = {
      answer_summary: 'First answer',
      references: [],
      results: [
        {
          title: 'First result',
          snippet: 'First snippet',
          domain: 'first.com',
          url: 'https://first.com',
        },
      ],
      pagination: { page: 1, totalChunks: 1, hasMore: false },
    };

    const secondResponse: UiApiAnswerContract = {
      answer_summary: 'Second answer',
      references: [],
      results: [
        {
          title: 'Second result',
          snippet: 'Second snippet',
          domain: 'second.com',
          url: 'https://second.com',
        },
      ],
      pagination: { page: 1, totalChunks: 1, hasMore: false },
    };

    const postSearchSpy = vi
      .spyOn(apiClient, 'postSearch')
      .mockResolvedValueOnce({ ok: true, value: firstResponse })
      .mockResolvedValueOnce({ ok: true, value: secondResponse });

    const { result } = renderHook(() => useSearch(), { wrapper: createWrapper() });

    result.current.search({ query: 'first query', sourceFilter: 'LIVE' });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).not.toBeNull();
    expect(result.current.data!.results[0]!.title).toBe('First result');

    result.current.search({ query: 'second query', sourceFilter: 'LIVE' });
    await waitFor(() => expect(postSearchSpy).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).not.toBeNull();
    const finalData = result.current.data!;
    expect(finalData.results).toHaveLength(1);
    expect(finalData.results[0]!.title).toBe('Second result');
  });
});
