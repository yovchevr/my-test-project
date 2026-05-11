/**
 * BookmarkButton — a small button for saving results or answers (FR-015 UI side, AC#5, AC#6, AC#7).
 *
 * Rendered on each `ResultCard` and on the `AnswerSummary`. Clicking calls
 * `POST /api/bookmarks` with `{ kind, payload }`. On success, toggles to a
 * "saved" visual state. On failure, surfaces a brief inline error notification
 * (toast or inline message) but MUST NOT replace the answer/results view with
 * `ErrorState` (AC#7).
 *
 * Per `ui-shell.md`, the bookmark save contract is `BookmarkSaveRequestContract`:
 * `{ kind: "result" | "answer", payload: unknown }`. The `payload` is the result
 * or answer object.
 */
import { useState } from 'react';
import { postBookmark } from '../api-client.js';

export type BookmarkButtonProps = {
  /**
   * Discriminant: "result" or "answer".
   */
  kind: 'result' | 'answer';
  /**
   * The result or answer payload to save. Passed verbatim to
   * `BookmarkSaveRequestContract.payload`.
   */
  payload: unknown;
  /**
   * Optional: if the item is already saved (e.g. loaded from the BOOKMARK
   * source filter), show the "saved" state immediately. Defaults to false.
   */
  initialSaved?: boolean;
  /**
   * Optional: ARIA label for the button. Defaults to "Bookmark this {kind}".
   */
  ariaLabel?: string;
  /**
   * Optional: auto-dismiss error notification after this many milliseconds.
   * Defaults to 5000ms. Injected per foundation/conventions.md line 52.
   */
  autoErrorDismissMs?: number;
};

export function BookmarkButton({
  kind,
  payload,
  initialSaved = false,
  ariaLabel,
  autoErrorDismissMs = 5000,
}: BookmarkButtonProps): JSX.Element {
  const [isSaved, setIsSaved] = useState(initialSaved);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    if (isSaved || isLoading) {
      return;
    }

    setIsLoading(true);
    setError(null);

    const result = await postBookmark({ kind, payload });

    setIsLoading(false);

    if (result.ok) {
      setIsSaved(true);
      // Clear any previous error.
      setError(null);
    } else {
      // AC#7: a failed bookmark save MUST surface a brief inline error
      // notification but MUST NOT replace the answer/results view with ErrorState.
      setError(result.error.message);
      // Auto-dismiss the error. Per foundation/conventions.md line 52, time is injected.
      setTimeout(() => setError(null), autoErrorDismissMs);
    }
  };

  const defaultLabel = `Bookmark this ${kind}`;
  const effectiveLabel = ariaLabel ?? defaultLabel;

  return (
    <div className="relative inline-flex flex-col items-center">
      <button
        type="button"
        onClick={handleClick}
        disabled={isSaved || isLoading}
        aria-label={effectiveLabel}
        className={`inline-flex items-center gap-1 rounded px-2 py-1 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 ${
          isSaved
            ? 'bg-green-100 text-green-800 hover:bg-green-200'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }`}
      >
        {/* Inline SVG bookmark icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill={isSaved ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
        {isSaved ? 'Saved' : isLoading ? 'Saving...' : 'Save'}
      </button>

      {/* Inline error notification (AC#7) */}
      {error && (
        <div
          role="alert"
          className="absolute top-full mt-1 w-max max-w-xs rounded bg-red-100 px-3 py-2 text-xs text-red-800 shadow-md"
        >
          {error}
        </div>
      )}
    </div>
  );
}
