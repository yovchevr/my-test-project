/**
 * Unit tests for ResultCard (FR-004).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ResultCardContract } from '@neo-search/contracts';
import { ResultCard } from './ResultCard.js';

describe('ResultCard', () => {
  const fixtureResult: ResultCardContract = {
    title: 'Example Result',
    snippet: 'This is a snippet of the result content.',
    domain: 'example.com',
    url: 'https://example.com/page',
  };

  it('renders all four fields (title, snippet, domain, url) (FR-004 acceptance criteria b, c, d)', () => {
    const { container } = render(<ResultCard result={fixtureResult} />);

    expect(screen.getByText('Example Result')).toBeInTheDocument();
    expect(screen.getByText('This is a snippet of the result content.')).toBeInTheDocument();
    expect(screen.getByText('example.com')).toBeInTheDocument();

    const link = container.querySelector('a[href="https://example.com/page"]');
    expect(link).toBeInTheDocument();
    expect(link).toHaveTextContent('Example Result');
  });

  it('opens the link in a new tab with noopener noreferrer (FR-004 acceptance criterion d)', () => {
    const { container } = render(<ResultCard result={fixtureResult} />);

    const link = container.querySelector('a[href="https://example.com/page"]');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('applies hover and focus styles per NFR-002', () => {
    const { container } = render(<ResultCard result={fixtureResult} />);

    const article = container.querySelector('article');
    expect(article).toHaveClass('hover:shadow-lg');
    expect(article).toHaveClass('focus-within:ring-2');
  });
});
