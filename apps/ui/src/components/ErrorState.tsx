/**
 * ErrorState — purposeful error state (FR-005).
 *
 * Per `ui-shell.md`, a failed call (network error OR structured `{ ok: false,
 * error }`) MUST render this component with copy keyed on the error `kind`
 * (FR-005 acceptance criterion b). Distinct from the empty state (FR-005
 * acceptance criterion a).
 *
 * Follows the same visual system as the populated list (NFR-002).
 */
import type { ApiError } from '../api-client.js';

export type ErrorStateProps = {
  error: ApiError;
};

/**
 * Map error kinds to user-facing copy per the story's Scope section.
 */
const ERROR_COPY: Record<ApiError['kind'], { title: string; message: string }> = {
  validation: {
    title: 'Invalid search',
    message: "Your search couldn't be processed. Please check your query and try again.",
  },
  terminal: {
    title: 'Service unavailable',
    message: 'The search service is unavailable. Please try again later.',
  },
  transient_exhausted: {
    title: 'Connection error',
    message: "We couldn't reach the search service. Please retry.",
  },
  cancelled: {
    title: 'Search timed out',
    message: 'The search took too long. Please try again.',
  },
  network: {
    title: 'Network error',
    message: 'A network error occurred. Please check your connection and retry.',
  },
  internal: {
    title: 'Unexpected error',
    message: 'An unexpected error occurred. Please try again.',
  },
};

export function ErrorState({ error }: ErrorStateProps) {
  const copy = ERROR_COPY[error.kind] ?? ERROR_COPY.internal;

  return (
    <div className="flex flex-col items-center justify-center rounded-lg bg-white p-8 shadow-md">
      <svg
        className="mb-4 h-16 w-16 text-red-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
      <h2 className="mb-2 text-xl font-semibold text-gray-900">{copy.title}</h2>
      <p className="text-center text-sm text-gray-600">{copy.message}</p>
    </div>
  );
}
