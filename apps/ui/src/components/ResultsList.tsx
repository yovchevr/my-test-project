/**
 * ResultsList — vertically scrollable list of ResultCard rows (FR-004).
 *
 * Per `ui-shell.md`, the results area MUST be vertically scrollable when
 * content exceeds the viewport (FR-004 acceptance criterion a). The list
 * renders N `ResultCard`s for N results; if the array is empty, the parent
 * (App) is responsible for showing `EmptyState` instead.
 */
import type { ResultCardContract } from '@neo-search/contracts';
import { ResultCard } from './ResultCard.js';

export type ResultsListProps = {
  results: ResultCardContract[];
};

export function ResultsList({ results }: ResultsListProps) {
  return (
    <div className="flex flex-col gap-4 overflow-y-auto" role="list">
      {results.map((result, index) => (
        <div key={`${result.url}-${index}`} role="listitem">
          <ResultCard result={result} />
        </div>
      ))}
    </div>
  );
}
