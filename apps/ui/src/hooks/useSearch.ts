/**
 * useSearch — React Query mutation for POST /api/search (FR-004, FR-006).
 *
 * Per the story's Scope, this hook handles the `POST /api/search` call,
 * exposes `data`, `isLoading`, `error`, and a `loadMore()` callback. Results
 * MUST append on load-more (FR-006 acceptance criterion a), not replace.
 *
 * React Query's mutation natively rejects overlapping calls (per the story's
 * Risks section), and the server-side `clientRequestId` dedup handles the
 * retry race.
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { SearchRequestContract, UiApiAnswerContract } from '@neo-search/contracts';
import { postSearch, type ApiError } from '../api-client.js';

/**
 * Search request shape without the page field (managed internally by the hook).
 */
export type SearchParams = Omit<SearchRequestContract, 'page' | 'clientRequestId'>;

/**
 * Accumulated search state: all results from page 1..N, plus the latest
 * pagination metadata.
 */
export type SearchData = {
  results: UiApiAnswerContract['results'];
  pagination: UiApiAnswerContract['pagination'];
  answerSummary: string;
  references: UiApiAnswerContract['references'];
};

export function useSearch() {
  const [accumulatedData, setAccumulatedData] = useState<SearchData | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchParams, setSearchParams] = useState<SearchParams | null>(null);

  const mutation = useMutation<UiApiAnswerContract, ApiError, SearchParams & { page: number }>({
    mutationFn: async ({ query, sourceFilter, page }) => {
      const result = await postSearch({ query, sourceFilter, page });
      if (!result.ok) {
        throw result.error;
      }
      return result.value;
    },
    onSuccess: (data, variables) => {
      // If this is page 1, replace; otherwise append.
      if (variables.page === 1) {
        setAccumulatedData({
          results: data.results,
          pagination: data.pagination,
          answerSummary: data.answer_summary,
          references: data.references,
        });
        setCurrentPage(1);
      } else {
        setAccumulatedData((prev) => ({
          results: [...(prev?.results ?? []), ...data.results],
          pagination: data.pagination,
          answerSummary: data.answer_summary,
          references: data.references,
        }));
      }
    },
    onError: () => {
      // On error, reset accumulated data so the ErrorState can render.
      setAccumulatedData(null);
    },
  });

  /**
   * Submit a new search (page 1). Resets accumulated data.
   */
  const search = (params: SearchParams) => {
    setSearchParams(params);
    setCurrentPage(1);
    setAccumulatedData(null);
    mutation.mutate({ ...params, page: 1 });
  };

  /**
   * Load the next page. Appends results to the accumulated list.
   */
  const loadMore = () => {
    if (!searchParams || !accumulatedData?.pagination.hasMore || mutation.isPending) {
      return;
    }
    const nextPage = currentPage + 1;
    setCurrentPage(nextPage);
    mutation.mutate({ ...searchParams, page: nextPage });
  };

  return {
    search,
    loadMore,
    data: accumulatedData,
    isLoading: mutation.isPending,
    error: mutation.error ?? null,
  };
}
