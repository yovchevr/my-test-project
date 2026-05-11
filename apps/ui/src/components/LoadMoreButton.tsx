/**
 * LoadMoreButton — progressive-loading affordance (FR-006).
 *
 * Per `ui-shell.md`, this button MUST appear when `pagination.hasMore` is
 * true (FR-006 acceptance criterion a). Clicking fires another `POST
 * /api/search` for `page + 1`; results MUST append to the list (NOT replace).
 *
 * While the fetch is in flight, the button MUST show a spinner (FR-006
 * acceptance criterion b) and MUST disappear when the fetch resolves.
 */
export type LoadMoreButtonProps = {
  onClick: () => void;
  isLoading: boolean;
  disabled?: boolean;
};

export function LoadMoreButton({ onClick, isLoading, disabled }: LoadMoreButtonProps) {
  return (
    <div className="mt-4 flex justify-center">
      <button
        onClick={onClick}
        disabled={disabled || isLoading}
        className="rounded-md bg-blue-600 px-6 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400"
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <svg
              className="h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            Loading...
          </span>
        ) : (
          'Load more'
        )}
      </button>
    </div>
  );
}
