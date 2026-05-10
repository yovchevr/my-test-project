/**
 * `SearchBar` — STORY-015 primary search controls (FR-002).
 *
 * Responsibilities pinned by `.design/components/ui-shell.md` and FR-002:
 *  - A controlled text input plus a primary submit button (FR-002 a/b).
 *  - Full-width on mobile (`xs` 320px+), max-width `max-w-2xl` on `md+` (FR-002 a + NFR-001).
 *  - Visible loading affordance: button disabled with a spinner while `isLoading` is true (FR-002 c).
 *  - The input is the visually most prominent input on the screen — uses the `display`
 *    typography step from `@neo-search/ui-tokens`, the largest in the scale (NFR-002).
 *
 * Submission rule:
 *  - Pressing Enter inside the input OR clicking the submit button MUST call `onSubmit`
 *    exactly once with the current `query` (the parent — `SearchPanel` — composes the
 *    full `SearchRequestContract` payload). When `isLoading` is true, the submit MUST
 *    be inert.
 *
 * Layering:
 *  - This component MUST NOT import agent or data-layer code (I-16). It is purely
 *    presentational + dispatches an injected callback.
 *  - All visual treatment is token-derived (palette / typography / spacing / focus-ring
 *    from `@neo-search/ui-tokens`); no inline hex literals (NFR-002, enforced by the
 *    no-inline-hex ESLint rule wired in STORY-014).
 */
import type { ChangeEvent, FormEvent } from 'react';

export interface SearchBarProps {
  /** Current query value — controlled by the parent (`SearchPanel`). */
  query: string;
  /** Called whenever the user types into the input. */
  onQueryChange: (next: string) => void;
  /**
   * Called when the user submits the form (Enter inside the input OR clicks the
   * submit button). MUST NOT fire while `isLoading` is true.
   */
  onSubmit: () => void;
  /**
   * When true, the submit button MUST be disabled and MUST display a spinner.
   * Bound to the agent's in-flight state by the parent (STORY-016 wires this to
   * the real API call; STORY-015 only enforces the contract).
   */
  isLoading?: boolean;
}

/**
 * Inline SVG spinner — uses `currentColor` so its stroke follows the surrounding
 * text color (which is itself token-derived). Keeping the icon inline avoids
 * pulling in a new runtime dependency at this stage; the story explicitly allows
 * deferring the `lucide-react` pin (`risks & assumptions §1`).
 *
 * `aria-hidden` because the spinner duplicates the disabled-button affordance —
 * screen readers announce "Search, dimmed" via the disabled button itself.
 */
function Spinner(): JSX.Element {
  return (
    <svg
      data-testid="search-bar-spinner"
      aria-hidden="true"
      role="presentation"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="animate-spin"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

export function SearchBar({
  query,
  onQueryChange,
  onSubmit,
  isLoading = false,
}: SearchBarProps): JSX.Element {
  /**
   * `<form onSubmit>` with a submit-type button is what makes Enter inside the
   * input trigger a single submission across browsers — Radix isn't involved.
   * `preventDefault` keeps the page from navigating (the prototype renders SPA-style).
   */
  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (isLoading) {
      // FR-002 c: submission MUST be inert while a request is in flight. We bail
      // before invoking the callback so the parent never sees a duplicate request.
      return;
    }
    onSubmit();
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>): void {
    onQueryChange(event.target.value);
  }

  return (
    <form
      role="search"
      aria-label="Search"
      data-testid="search-bar"
      onSubmit={handleSubmit}
      // Full-width at `xs` (320px+); constrained to `max-w-2xl` on `md+` per FR-002 a.
      // `mx-auto` keeps it centered inside its slot; the AppShell already constrains
      // the outer page to `max-w-screen-xl`.
      className="flex w-full max-w-2xl mx-auto items-stretch gap-rhythm-tight"
    >
      <label htmlFor="search-bar-input" className="sr-only">
        Search query
      </label>
      <input
        id="search-bar-input"
        data-testid="search-bar-input"
        type="search"
        autoComplete="off"
        // The `display` step is the largest in the typography scale exported by
        // `@neo-search/ui-tokens`; using it here is what makes the search bar the
        // visually most prominent input on the screen (FR-002, NFR-002).
        className="
          flex-1 min-w-0 rounded-card-sm border border-border bg-surface
          px-rhythm-base py-rhythm-tight text-display text-text-default
          placeholder:text-text-muted
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus
          focus-visible:ring-offset-2 focus-visible:ring-offset-focus
        "
        placeholder="Search the web"
        value={query}
        onChange={handleInputChange}
        aria-label="Search query"
      />
      <button
        type="submit"
        data-testid="search-bar-submit"
        disabled={isLoading}
        aria-busy={isLoading}
        // The submit uses the same `primary-600` palette token the AppShell's global
        // action uses, so the two prominent affordances stay visually coherent (NFR-002).
        className="
          inline-flex shrink-0 items-center justify-center gap-rhythm-tight
          rounded-card-sm bg-primary-600 px-rhythm-loose py-rhythm-tight
          text-body font-semibold text-surface
          hover:bg-primary-700
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus
          focus-visible:ring-offset-2 focus-visible:ring-offset-focus
          disabled:cursor-not-allowed disabled:opacity-60
        "
      >
        {isLoading ? <Spinner /> : null}
        <span>Search</span>
      </button>
    </form>
  );
}
