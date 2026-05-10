/**
 * `SearchPanel` — STORY-015 composition layer (FR-002 + FR-003).
 *
 * Slots into `AppShell`'s `controls` prop and renders `SearchBar` + `SourceFilterBar`
 * stacked. Owns the `query` and `sourceFilter` state via `useState` (per
 * `.design/technology/tech-stack.md` §"frontend state library beyond useState/useReducer
 * MUST NOT be added"). Submission yields a `SearchRequestContract` payload bound
 * for STORY-016 — the panel takes the callback as a prop so this story stays
 * fully decoupled from any real API plumbing.
 *
 * Defaults pinned by the story:
 *   - `sourceFilter` defaults to `LIVE` on mount (`Acceptance criteria` bullet 9).
 *   - `page` is always `1` on submit; pagination is STORY-016's affordance.
 *
 * Layering:
 *   - This component MUST NOT import agent or data-layer code (I-16). The only
 *     legal seam is `@neo-search/contracts` (types only) per `.design/components/ui-shell.md`.
 *   - The `SourceFilter` type comes from `@neo-search/contracts`; this file MUST
 *     NOT redeclare the literal trio (I-34).
 */
import { useState } from 'react';
import type { SearchRequestContract, SourceFilterEnum } from '@neo-search/contracts';
import { SearchBar } from './SearchBar.js';
import { SourceFilterBar } from './SourceFilterBar.js';

export interface SearchPanelProps {
  /**
   * Called with a fully-formed `SearchRequestContract` whenever the user
   * submits. STORY-016 will pass a function that issues the actual `/api/search`
   * call; until then the parent (e.g. `main.tsx`) wires a placeholder.
   *
   * The callback's return type is `void` so the panel does not depend on the
   * caller's async strategy — the in-flight `isLoading` state is owned by the
   * caller and threaded back via the `isLoading` prop.
   */
  onSearch: (request: SearchRequestContract) => void;
  /**
   * The agent's in-flight state. Forwarded to `SearchBar` so its submit button
   * shows the spinner / disabled affordance for the duration of the request
   * (FR-002 c). STORY-016 owns the wiring; STORY-015 only enforces the contract.
   */
  isLoading?: boolean;
}

/**
 * The default source filter on first mount. Pinned to `LIVE` by the story
 * (`Acceptance criteria` bullet 9). Defined as a module-level constant so it
 * is grep-able from the test and impossible to typo as a string literal.
 */
const DEFAULT_SOURCE_FILTER: SourceFilterEnum = 'LIVE';

export function SearchPanel({ onSearch, isLoading = false }: SearchPanelProps): JSX.Element {
  const [query, setQuery] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilterEnum>(DEFAULT_SOURCE_FILTER);

  function handleSubmit(): void {
    // The contract requires a non-empty `query` (`SearchRequestContract.query`
    // has `minLength: 1`). Bail silently here so an accidental empty submit
    // (e.g. clicking before typing) does not generate an invalid request — the
    // contract validator on the API side would reject it anyway, and STORY-016
    // owns the visible empty-state UX.
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return;
    }
    const request: SearchRequestContract = {
      query: trimmed,
      sourceFilter,
      page: 1,
    };
    onSearch(request);
  }

  return (
    <div data-testid="search-panel" className="flex w-full flex-col items-stretch gap-rhythm-base">
      <SearchBar
        query={query}
        onQueryChange={setQuery}
        onSubmit={handleSubmit}
        isLoading={isLoading}
      />
      <SourceFilterBar value={sourceFilter} onChange={setSourceFilter} />
    </div>
  );
}
