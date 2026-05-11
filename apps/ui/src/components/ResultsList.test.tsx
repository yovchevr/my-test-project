/**
 * Unit tests for ResultsList (FR-004).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ResultCardContract } from '@neo-search/contracts';
import { ResultsList } from './ResultsList.js';

describe('ResultsList', () => {
  const fixtureResults: ResultCardContract[] = [
    {
      title: 'First Result',
      snippet: 'Snippet one',
      domain: 'first.com',
      url: 'https://first.com/page',
    },
    {
      title: 'Second Result',
      snippet: 'Snippet two',
      domain: 'second.com',
      url: 'https://second.com/page',
    },
    {
      title: 'Third Result',
      snippet: 'Snippet three',
      domain: 'third.com',
      url: 'https://third.com/page',
    },
  ];

  it('renders N ResultCards from a fixture (FR-004 acceptance criterion b)', () => {
    render(<ResultsList results={fixtureResults} />);

    expect(screen.getByText('First Result')).toBeInTheDocument();
    expect(screen.getByText('Second Result')).toBeInTheDocument();
    expect(screen.getByText('Third Result')).toBeInTheDocument();
  });

  it('applies vertical scroll when content exceeds viewport (FR-004 acceptance criterion a)', () => {
    const { container } = render(<ResultsList results={fixtureResults} />);

    const list = container.querySelector('[role="list"]');
    expect(list).toHaveClass('overflow-y-auto');
  });

  it('renders an empty list when results array is empty', () => {
    const { container } = render(<ResultsList results={[]} />);

    const list = container.querySelector('[role="list"]');
    expect(list).toBeInTheDocument();
    expect(list?.children).toHaveLength(0);
  });

  it('each card has all four fields visible', () => {
    const singleResult: ResultCardContract[] = [
      {
        title: 'Single Result Title',
        snippet: 'Single snippet text',
        domain: 'single.com',
        url: 'https://single.com/page',
      },
    ];

    const { container } = render(<ResultsList results={singleResult} />);

    // Check all four fields are present.
    expect(screen.getByText('Single Result Title')).toBeInTheDocument();
    expect(screen.getByText('Single snippet text')).toBeInTheDocument();
    expect(screen.getByText('single.com')).toBeInTheDocument();

    const link = container.querySelector('a[href="https://single.com/page"]');
    expect(link).toBeInTheDocument();
    expect(link).toHaveTextContent('Single Result Title');
  });
});
