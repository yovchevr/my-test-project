/**
 * ReferencesList — renders the `references[]` as a numbered list (FR-009, AC#3, AC#4).
 *
 * Per `synthesis.md`, each reference entry has a non-empty title, url, and context.
 * This component renders them as a numbered list (1, 2, …) with:
 * - Title linked to `url` with `target="_blank" rel="noopener noreferrer"` (FR-009 a).
 * - Domain extracted from the URL.
 * - One-line `context` field (FR-009 c).
 *
 * Each entry has `id="ref-N"` so citation markers in `AnswerSummary` can scroll
 * to them (AC#3). The entry is also focusable (`tabIndex={-1}`) so the marker's
 * `focus()` call can highlight it (AC#2).
 *
 * An empty `references[]` MUST NOT render the block at all (AC#4).
 */
import type { ReferenceEntryContract } from '@neo-search/contracts';

export type ReferencesListProps = {
  /**
   * The references array from `UiApiAnswerContract`. Per FR-009 / I-3, every
   * entry is guaranteed to have non-empty title/url/context (validated by
   * STORY-012's contract validator).
   */
  references: ReferenceEntryContract[];
};

/**
 * Extract the domain from a URL string. Returns the hostname without the
 * protocol or path. Falls back to the full URL if parsing fails.
 */
function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    // Defense: if the URL is malformed (shouldn't happen after contract
    // validation, but safe fallback), return the raw string.
    return url;
  }
}

export function ReferencesList({ references }: ReferencesListProps): JSX.Element | null {
  // AC#4: an empty `references[]` MUST NOT render the block.
  if (references.length === 0) {
    return null;
  }

  return (
    <section
      data-testid="references-list"
      className="rounded-lg bg-white p-6 shadow-md"
      aria-label="References"
    >
      <h2 className="mb-4 text-xl font-semibold text-gray-900">References</h2>
      <ol className="space-y-4">
        {references.map((ref, index) => {
          const markerNumber = index + 1;
          const domain = extractDomain(ref.url);

          return (
            <li
              key={ref.id}
              id={`ref-${markerNumber}`}
              tabIndex={-1}
              className="border-l-4 border-blue-500 pl-4 focus:bg-blue-50 focus:outline-none"
            >
              <div className="mb-1 flex items-baseline gap-2">
                <span className="font-mono text-sm font-semibold text-blue-600">
                  [{markerNumber}]
                </span>
                <h3 className="text-base font-semibold text-gray-900">
                  <a
                    href={ref.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-blue-600 focus:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {ref.title}
                  </a>
                </h3>
              </div>
              <p className="mb-1 text-xs text-gray-500">{domain}</p>
              <p className="text-sm text-gray-700">{ref.context}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
