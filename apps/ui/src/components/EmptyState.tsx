/**
 * EmptyState — purposeful zero-result state (FR-005).
 *
 * Per `ui-shell.md`, a successful response with zero results MUST render this
 * component instead of a blank screen (FR-005 acceptance criterion c). The
 * copy is purposeful and action-oriented. Follows the same visual system as
 * the populated list (NFR-002 acceptance criterion d).
 */
export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg bg-white p-8 shadow-md">
      <svg
        className="mb-4 h-16 w-16 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
      <h2 className="mb-2 text-xl font-semibold text-gray-900">No results found</h2>
      <p className="text-center text-sm text-gray-600">
        No results for that query — try a broader search.
      </p>
    </div>
  );
}
