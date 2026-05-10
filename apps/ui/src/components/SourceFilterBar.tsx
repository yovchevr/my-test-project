/**
 * `SourceFilterBar` — STORY-015 secondary source-filter bar (FR-003).
 *
 * Renders the closed enum `LIVE | HISTORY | BOOKMARK` as a Radix `Tabs.Root`
 * trio. The enum values come from `@neo-search/contracts`'s `SourceFilterEnum`;
 * this component MUST NOT redeclare the literals (I-34, NFR-006: variants are
 * data, not code — adding a fourth source type is a contract change, not a UI
 * fork).
 *
 * Each trigger renders both an icon and a text label per FR-003 c. Icons are
 * inline SVGs using `currentColor` so the hover/focus palette tokens apply
 * uniformly — the story's `risks & assumptions §1` explicitly defers pinning
 * an external icon library.
 *
 * Selecting a trigger calls the `onChange(filter)` prop with the selected
 * `SourceFilterEnum` value; visual selection is signalled by Radix's
 * `data-state="active"` attribute (per the AC: "Radix's data-state='active' is
 * sufficient").
 *
 * Keyboard navigation (left/right arrows) is provided by Radix `Tabs` defaults —
 * STORY-019's keyboard-reachability E2E suite asserts this in a real browser.
 */
import * as Tabs from '@radix-ui/react-tabs';
import type { JSX } from 'react';
import type { SourceFilterEnum } from '@neo-search/contracts';

export interface SourceFilterBarProps {
  /** Currently-selected filter (controlled). */
  value: SourceFilterEnum;
  /** Called when the user picks a different filter. */
  onChange: (next: SourceFilterEnum) => void;
}

/**
 * The three filter entries, defined as data (NFR-006). Each row is the literal
 * source-filter enum value, the visible label, and the inline icon component.
 *
 * The `value` field is typed as `SourceFilterEnum` so adding a fourth source
 * type would require a contract change in `@neo-search/contracts` first — the
 * compiler will block any local-only fourth entry.
 */
const FILTER_ENTRIES: ReadonlyArray<{
  value: SourceFilterEnum;
  label: string;
  Icon: () => JSX.Element;
}> = [
  { value: 'LIVE', label: 'LIVE', Icon: LiveIcon },
  { value: 'HISTORY', label: 'HISTORY', Icon: HistoryIcon },
  { value: 'BOOKMARK', label: 'BOOKMARK', Icon: BookmarkIcon },
];

/** Radio-wave / globe icon for LIVE. */
function LiveIcon(): JSX.Element {
  return (
    <svg
      data-testid="source-filter-icon-LIVE"
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
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M5 12a7 7 0 0 1 14 0" />
      <path d="M2 12a10 10 0 0 1 20 0" />
    </svg>
  );
}

/** Clock icon for HISTORY. */
function HistoryIcon(): JSX.Element {
  return (
    <svg
      data-testid="source-filter-icon-HISTORY"
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
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

/** Bookmark icon for BOOKMARK. */
function BookmarkIcon(): JSX.Element {
  return (
    <svg
      data-testid="source-filter-icon-BOOKMARK"
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
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function SourceFilterBar({ value, onChange }: SourceFilterBarProps): JSX.Element {
  /**
   * Radix's `onValueChange` is a `(value: string) => void`. We narrow back to
   * `SourceFilterEnum` at the boundary because the only legal source of values
   * is the `FILTER_ENTRIES` table above. The runtime guard (`includes` check)
   * is defensive — Radix only emits the values we registered, but the boundary
   * narrowing keeps the structured `Result`-style discipline of `.design/foundation/conventions.md`.
   */
  function handleValueChange(next: string): void {
    const allowed: ReadonlyArray<SourceFilterEnum> = FILTER_ENTRIES.map((entry) => entry.value);
    if ((allowed as ReadonlyArray<string>).includes(next)) {
      onChange(next as SourceFilterEnum);
    }
  }

  return (
    <Tabs.Root
      value={value}
      onValueChange={handleValueChange}
      data-testid="source-filter-bar"
      // The bar sits under the search controls; the `flex-wrap` lets it wrap
      // to a second row at 320px without horizontal scrolling (NFR-001).
      className="w-full"
      aria-label="Source filter"
    >
      <Tabs.List
        data-testid="source-filter-list"
        className="
          flex w-full flex-wrap items-center justify-start gap-rhythm-tight
          rounded-card-sm border border-border bg-surface p-rhythm-xtight
        "
      >
        {FILTER_ENTRIES.map(({ value: filterValue, label, Icon }) => (
          <Tabs.Trigger
            key={filterValue}
            value={filterValue}
            data-testid={`source-filter-trigger-${filterValue}`}
            className="
              inline-flex items-center justify-center gap-rhythm-tight
              rounded-card-sm px-rhythm-base py-rhythm-tight
              text-caption font-medium text-text-muted
              hover:bg-surface-overlay hover:text-text-default
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus
              focus-visible:ring-offset-2 focus-visible:ring-offset-focus
              data-[state=active]:bg-primary-600 data-[state=active]:text-surface
            "
          >
            <Icon />
            <span data-testid={`source-filter-label-${filterValue}`}>{label}</span>
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs.Root>
  );
}
