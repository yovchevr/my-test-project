/**
 * Unit tests for ReferencesList (FR-009, AC#3, AC#4).
 *
 * Coverage:
 * - Numbered rendering (1, 2, …).
 * - Each entry shows title (linked to `url` with `target="_blank" rel="noopener noreferrer"`), domain, and context.
 * - Empty list renders nothing (AC#4).
 * - Entries have `id="ref-N"` for anchor targets (AC#3).
 * - Entries are focusable (`tabIndex={-1}`) so `AnswerSummary` can scroll/focus them.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ReferencesList } from './ReferencesList.js';
import type { ReferenceEntryContract } from '@neo-search/contracts';

describe('ReferencesList', () => {
  afterEach(() => {
    cleanup();
  });
  it('renders a numbered list of references', () => {
    const references: ReferenceEntryContract[] = [
      {
        id: 'ref-001',
        title: 'TypeScript Documentation',
        url: 'https://www.typescriptlang.org/docs/',
        context: 'Official TypeScript documentation homepage.',
      },
      {
        id: 'ref-002',
        title: 'JavaScript MDN',
        url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
        context: 'Mozilla Developer Network guide to JavaScript.',
      },
    ];

    render(<ReferencesList references={references} />);

    expect(screen.getByText('[1]')).toBeInTheDocument();
    expect(screen.getByText('[2]')).toBeInTheDocument();
  });

  it('renders each reference with title, domain, and context (AC#3)', () => {
    const references: ReferenceEntryContract[] = [
      {
        id: 'ref-001',
        title: 'Example Article',
        url: 'https://example.com/article',
        context: 'A one-line summary of the article.',
      },
    ];

    render(<ReferencesList references={references} />);

    const titleLink = screen.getByRole('link', { name: /example article/i });
    expect(titleLink).toBeInTheDocument();
    expect(titleLink).toHaveAttribute('href', 'https://example.com/article');
    expect(titleLink).toHaveAttribute('target', '_blank');
    expect(titleLink).toHaveAttribute('rel', 'noopener noreferrer');

    expect(screen.getByText('example.com')).toBeInTheDocument();
    expect(screen.getByText('A one-line summary of the article.')).toBeInTheDocument();
  });

  it('renders nothing when references array is empty (AC#4)', () => {
    const references: ReferenceEntryContract[] = [];

    const { container } = render(<ReferencesList references={references} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('assigns id="ref-N" to each entry (AC#3)', () => {
    const references: ReferenceEntryContract[] = [
      {
        id: 'ref-001',
        title: 'First Reference',
        url: 'https://first.com/',
        context: 'First context.',
      },
      {
        id: 'ref-002',
        title: 'Second Reference',
        url: 'https://second.com/',
        context: 'Second context.',
      },
    ];

    render(<ReferencesList references={references} />);

    const firstEntry = document.getElementById('ref-1');
    const secondEntry = document.getElementById('ref-2');

    expect(firstEntry).toBeInTheDocument();
    expect(secondEntry).toBeInTheDocument();
  });

  it('makes each entry focusable with tabIndex={-1}', () => {
    const references: ReferenceEntryContract[] = [
      {
        id: 'ref-001',
        title: 'Focusable Entry',
        url: 'https://focusable.com/',
        context: 'This entry can be focused programmatically.',
      },
    ];

    render(<ReferencesList references={references} />);

    const entry = document.getElementById('ref-1');
    expect(entry).toHaveAttribute('tabIndex', '-1');
  });

  it('extracts the domain from each URL', () => {
    const references: ReferenceEntryContract[] = [
      {
        id: 'ref-001',
        title: 'GitHub Docs',
        url: 'https://docs.github.com/en',
        context: 'GitHub documentation.',
      },
      {
        id: 'ref-002',
        title: 'NPM Package',
        url: 'https://www.npmjs.com/package/vitest',
        context: 'Vitest NPM package page.',
      },
    ];

    render(<ReferencesList references={references} />);

    expect(screen.getByText('docs.github.com')).toBeInTheDocument();
    expect(screen.getByText('www.npmjs.com')).toBeInTheDocument();
  });

  it('handles malformed URLs gracefully by showing the raw URL as domain', () => {
    const references: ReferenceEntryContract[] = [
      {
        id: 'ref-001',
        title: 'Malformed URL',
        url: 'not-a-valid-url',
        context: 'This URL is malformed.',
      },
    ];

    render(<ReferencesList references={references} />);

    // The extractDomain fallback should return the raw string.
    expect(screen.getByText('not-a-valid-url')).toBeInTheDocument();
  });

  it('renders multiple references in the correct order', () => {
    const references: ReferenceEntryContract[] = [
      {
        id: 'ref-001',
        title: 'First',
        url: 'https://first.com/',
        context: 'First context.',
      },
      {
        id: 'ref-002',
        title: 'Second',
        url: 'https://second.com/',
        context: 'Second context.',
      },
      {
        id: 'ref-003',
        title: 'Third',
        url: 'https://third.com/',
        context: 'Third context.',
      },
    ];

    render(<ReferencesList references={references} />);

    const markers = screen.getAllByText(/\[\d+\]/);
    expect(markers[0]).toHaveTextContent('[1]');
    expect(markers[1]).toHaveTextContent('[2]');
    expect(markers[2]).toHaveTextContent('[3]');
  });
});
