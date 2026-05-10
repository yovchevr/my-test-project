/**
 * `AppShell` — the wave-2 UI shell every other UI story renders inside (FR-001).
 *
 * Responsibilities pinned by `.design/components/ui-shell.md`:
 *  - Sticky top bar that anchors the product title across viewports (FR-001 a/b/d).
 *  - At least one global action (FR-001 c). STORY-014 picks "Refresh" — the design doc
 *    explicitly suggests "a refresh affordance" as an example.
 *  - Stays readable / operable from a 320px viewport upward (NFR-001).
 *  - Hosts two named slots downstream UI stories drop into without modifying the shell.
 *
 * Slot structure (the contract for STORY-015..STORY-017):
 *
 *   +------------------------------------------------------------+
 *   |  TopBar  [product title]               [refresh action]    |
 *   +------------------------------------------------------------+
 *   |                                                            |
 *   |  controls slot  (STORY-015 search controls drop here)      |
 *   |                                                            |
 *   +------------------------------------------------------------+
 *   |                                                            |
 *   |  results slot   (STORY-016 results / STORY-017 answer)     |
 *   |                                                            |
 *   +------------------------------------------------------------+
 *
 * The `controls` and `results` props are React node slots. A consumer who omits
 * them gets an empty shell — useful for STORY-014's stand-alone story-1 demo and
 * for the unit test that asserts the shell renders without panicking on missing slots.
 *
 * This component MUST NOT import agent or data-layer code. Its only legal seams are
 * `@neo-search/contracts` (types only) and `@neo-search/ui-tokens` (Tailwind preset)
 * — see `.design/components/ui-shell.md` Layering §.
 */
import type { ReactNode } from 'react';

export interface AppShellProps {
  /**
   * Slot for the search controls (STORY-015). When omitted, the controls region
   * collapses to zero height — the shell does not render a placeholder so the
   * story-2 surface is whatever STORY-015 chooses.
   */
  controls?: ReactNode;
  /**
   * Slot for the results / answer area (STORY-016 + STORY-017).
   */
  results?: ReactNode;
  /**
   * The label of the global action button on the top bar. Defaults to "Refresh" —
   * the design doc names this as the example global action. A future story MAY
   * override the label without rewriting the shell.
   */
  globalActionLabel?: string;
  /**
   * Click handler for the global action. STORY-014 wires a no-op default; downstream
   * stories will pass a real handler that re-runs the active query (FR-001 c).
   */
  onGlobalAction?: () => void;
}

const PRODUCT_TITLE = 'neo-search';

/**
 * The top bar height is fixed (`h-14`, 3.5rem) across viewport widths, satisfying
 * FR-001 acceptance criterion d ("consistent height across viewport widths from 320
 * to 1920"). The Playwright suite in STORY-019 asserts this in real browsers; this
 * unit test only verifies the class is applied.
 */
const TOP_BAR_HEIGHT_CLASS = 'h-14';

export function AppShell({
  controls,
  results,
  globalActionLabel = 'Refresh',
  onGlobalAction,
}: AppShellProps): JSX.Element {
  return (
    <div className="flex min-h-screen flex-col bg-surface-sunken text-text-default">
      <header
        // The `sticky top-0 z-10` trio is what makes the top bar anchor across pages
        // (FR-001 a). `bg-surface` keeps it opaque so content scrolling underneath
        // does not bleed through.
        className={`sticky top-0 z-10 ${TOP_BAR_HEIGHT_CLASS} w-full border-b border-border bg-surface px-rhythm-base shadow-card`}
        role="banner"
        data-testid="app-shell-top-bar"
      >
        <div className="mx-auto flex h-full w-full max-w-screen-xl items-center justify-between gap-rhythm-base">
          <h1 className="truncate text-heading text-text-default" data-testid="app-shell-title">
            {PRODUCT_TITLE}
          </h1>
          <button
            type="button"
            onClick={onGlobalAction}
            data-testid="app-shell-global-action"
            className="
              inline-flex items-center justify-center rounded-card-sm
              bg-primary-600 px-rhythm-base py-rhythm-tight
              text-caption font-medium text-surface
              hover:bg-primary-700
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus
              focus-visible:ring-offset-2 focus-visible:ring-offset-focus
              disabled:cursor-not-allowed disabled:opacity-60
            "
          >
            {globalActionLabel}
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-screen-xl flex-1 flex-col gap-rhythm-loose px-rhythm-base py-rhythm-loose">
        {controls !== undefined && (
          <section
            aria-label="Search controls"
            data-testid="app-shell-controls-slot"
            className="w-full"
          >
            {controls}
          </section>
        )}
        {results !== undefined && (
          <section
            aria-label="Results"
            data-testid="app-shell-results-slot"
            className="w-full flex-1"
          >
            {results}
          </section>
        )}
      </main>
    </div>
  );
}
