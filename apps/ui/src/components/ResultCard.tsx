/**
 * ResultCard — a single search result card (FR-004).
 *
 * Per `ui-shell.md`, each card MUST render title, snippet, domain, and a
 * clickable link to the source. The card uses `@neo-search/ui-tokens`'s card
 * style (rounded + elevation) and respects hover/focus per NFR-002.
 *
 * The link opens in a new tab with `target="_blank"` + `rel="noopener
 * noreferrer"` for safety (FR-004 acceptance criterion c).
 */
import type { ResultCardContract } from '@neo-search/contracts';

export type ResultCardProps = {
  result: ResultCardContract;
};

export function ResultCard({ result }: ResultCardProps) {
  return (
    <article className="rounded-lg bg-white p-4 shadow-md transition-shadow hover:shadow-lg focus-within:ring-2 focus-within:ring-blue-500">
      <h3 className="mb-2 text-lg font-semibold text-gray-900">
        <a
          href={result.url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-blue-600 focus:text-blue-600 focus:outline-none"
        >
          {result.title}
        </a>
      </h3>
      <p className="mb-2 text-sm text-gray-600">{result.snippet}</p>
      <p className="text-xs text-gray-500">{result.domain}</p>
    </article>
  );
}
