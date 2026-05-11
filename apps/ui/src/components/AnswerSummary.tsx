/**
 * AnswerSummary — renders the answer_summary with inline citation markers (FR-007, FR-008).
 *
 * Per `synthesis.md`, citation markers are inline numeric markers `[1]`, `[2]`, …
 * pointing into the references list. This component parses the `answer_summary`
 * text and converts `[N]` substrings into clickable anchors that scroll to and
 * highlight the matching `ReferencesList` entry at `#ref-N` (AC#1, AC#2).
 *
 * Only `\[\d+\]` patterns are treated as citation markers — other bracket content
 * (e.g. `[1.5x]`) renders as literal text (Risk mitigation per story's "Risks &
 * assumptions").
 *
 * Keyboard navigation: each anchor is keyboard-focusable; pressing Enter or
 * clicking scrolls the target into view and moves focus (AC#2).
 */
import { useCallback } from 'react';

export type AnswerSummaryProps = {
  /**
   * The answer summary text with inline `[N]` citation markers. Per FR-007 /
   * I-1, this MUST be non-empty when passed to the component.
   */
  answerSummary: string;
};

/**
 * Parse the answer summary and return an array of text chunks and citation
 * markers. Each chunk is either `{ type: 'text', value: string }` or
 * `{ type: 'marker', value: number }`.
 *
 * The regex matches `[N]` where N is one or more digits. Only these are treated
 * as citation markers; other bracket patterns render as literal text.
 */
function parseAnswerSummary(
  text: string | undefined,
): Array<{ type: 'text' | 'marker'; value: string | number }> {
  if (!text) {
    return [];
  }

  const citationRegex = /\[(\d+)\]/g;
  const chunks: Array<{ type: 'text' | 'marker'; value: string | number }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = citationRegex.exec(text)) !== null) {
    // Add preceding text as a text chunk (if any).
    if (match.index > lastIndex) {
      chunks.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    // Add the citation marker as a marker chunk.
    const markerNumber = parseInt(match[1], 10);
    chunks.push({ type: 'marker', value: markerNumber });
    lastIndex = citationRegex.lastIndex;
  }

  // Add remaining text after the last marker (if any).
  if (lastIndex < text.length) {
    chunks.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return chunks;
}

export function AnswerSummary({ answerSummary }: AnswerSummaryProps): JSX.Element {
  const chunks = parseAnswerSummary(answerSummary);

  /**
   * Handle clicking or pressing Enter on a citation marker. Scrolls the target
   * reference entry into view and moves focus to it (AC#2).
   */
  const handleMarkerActivate = useCallback((markerNumber: number) => {
    const targetId = `ref-${markerNumber}`;
    const targetElement = document.getElementById(targetId);

    if (targetElement) {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetElement.focus({ preventScroll: true });
    } else {
      // Defense in depth: if the target doesn't exist, log a warning but don't crash.
      console.warn(
        `Citation marker [${markerNumber}] points at #${targetId}, but no matching reference entry exists.`,
      );
    }
  }, []);

  return (
    <section
      data-testid="answer-summary"
      className="rounded-lg bg-white p-6 shadow-md"
      aria-label="Answer summary"
    >
      <h2 className="mb-4 text-xl font-semibold text-gray-900">Answer</h2>
      <div className="whitespace-pre-wrap text-base leading-relaxed text-gray-800">
        {chunks.map((chunk, index) => {
          if (chunk.type === 'text') {
            return <span key={index}>{chunk.value as string}</span>;
          } else {
            const markerNumber = chunk.value as number;
            return (
              <a
                key={index}
                href={`#ref-${markerNumber}`}
                onClick={(e) => {
                  e.preventDefault();
                  handleMarkerActivate(markerNumber);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleMarkerActivate(markerNumber);
                  }
                }}
                className="inline-flex items-baseline text-blue-600 hover:text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label={`Citation ${markerNumber}`}
                tabIndex={0}
              >
                [{markerNumber}]
              </a>
            );
          }
        })}
      </div>
    </section>
  );
}
