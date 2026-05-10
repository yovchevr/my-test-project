/**
 * STORY-015 acceptance tests for `SearchPanel` (FR-002 + FR-003 composition).
 *
 * Each test name cites the FR/AC it covers per
 * `.design/foundation/naming-conventions.md`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SearchRequestContract } from '@neo-search/contracts';
import { SearchPanel } from './SearchPanel.js';

beforeEach(() => {
  cleanup();
});

describe('STORY-015 SearchPanel composition (FR-002 + FR-003)', () => {
  it('renders both the search bar and the source-filter bar', () => {
    render(<SearchPanel onSearch={vi.fn()} />);
    expect(screen.getByTestId('search-bar')).toBeInTheDocument();
    expect(screen.getByTestId('source-filter-bar')).toBeInTheDocument();
  });

  it('defaults the source filter to LIVE on mount (AC bullet 9)', () => {
    render(<SearchPanel onSearch={vi.fn()} />);
    // The panel's initial state is reflected in the trigger's `data-state`.
    expect(screen.getByTestId('source-filter-trigger-LIVE')).toHaveAttribute(
      'data-state',
      'active',
    );
  });
});

describe('STORY-015 SearchPanel submission contract (FR-002 b, FR-021)', () => {
  it('forwards a SearchRequestContract on submit with page=1 and the LIVE default (FR-002 b)', async () => {
    const handler = vi.fn<(request: SearchRequestContract) => void>();
    const user = userEvent.setup();
    render(<SearchPanel onSearch={handler} />);

    const input = screen.getByTestId('search-bar-input');
    await user.type(input, 'neo search');
    await user.click(screen.getByTestId('search-bar-submit'));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      query: 'neo search',
      sourceFilter: 'LIVE',
      page: 1,
    });
  });

  it('reflects the currently-selected filter in the submitted payload (FR-003 routing seam)', async () => {
    const handler = vi.fn<(request: SearchRequestContract) => void>();
    const user = userEvent.setup();
    render(<SearchPanel onSearch={handler} />);

    await user.type(screen.getByTestId('search-bar-input'), 'old query');
    await user.click(screen.getByTestId('source-filter-trigger-HISTORY'));
    await user.click(screen.getByTestId('search-bar-submit'));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      query: 'old query',
      sourceFilter: 'HISTORY',
      page: 1,
    });
  });

  it('forwards BOOKMARK when BOOKMARK is selected (FR-003 routing seam)', async () => {
    const handler = vi.fn<(request: SearchRequestContract) => void>();
    const user = userEvent.setup();
    render(<SearchPanel onSearch={handler} />);

    await user.type(screen.getByTestId('search-bar-input'), 'saved page');
    await user.click(screen.getByTestId('source-filter-trigger-BOOKMARK'));
    await user.click(screen.getByTestId('search-bar-submit'));

    expect(handler).toHaveBeenCalledWith({
      query: 'saved page',
      sourceFilter: 'BOOKMARK',
      page: 1,
    });
  });

  it('triggers onSearch on Enter inside the input (FR-002 b alternative)', async () => {
    const handler = vi.fn<(request: SearchRequestContract) => void>();
    const user = userEvent.setup();
    render(<SearchPanel onSearch={handler} />);

    const input = screen.getByTestId('search-bar-input');
    await user.click(input);
    await user.keyboard('hello{Enter}');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      query: 'hello',
      sourceFilter: 'LIVE',
      page: 1,
    });
  });

  it('does NOT call onSearch when the query is empty (contract minLength: 1)', async () => {
    const handler = vi.fn();
    const user = userEvent.setup();
    render(<SearchPanel onSearch={handler} />);
    await user.click(screen.getByTestId('search-bar-submit'));
    expect(handler).not.toHaveBeenCalled();
  });

  it('does NOT call onSearch when the query is whitespace-only', async () => {
    const handler = vi.fn();
    const user = userEvent.setup();
    render(<SearchPanel onSearch={handler} />);
    await user.type(screen.getByTestId('search-bar-input'), '   ');
    await user.click(screen.getByTestId('search-bar-submit'));
    expect(handler).not.toHaveBeenCalled();
  });

  it('trims surrounding whitespace before forwarding the query', async () => {
    const handler = vi.fn<(request: SearchRequestContract) => void>();
    const user = userEvent.setup();
    render(<SearchPanel onSearch={handler} />);

    await user.type(screen.getByTestId('search-bar-input'), '  hello world  ');
    await user.click(screen.getByTestId('search-bar-submit'));

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'hello world', page: 1 }),
    );
  });
});

describe('STORY-015 SearchPanel loading state (FR-002 c)', () => {
  it('passes isLoading through to the search bar (disabled submit, spinner)', () => {
    render(<SearchPanel onSearch={vi.fn()} isLoading />);
    expect(screen.getByTestId('search-bar-submit')).toBeDisabled();
    expect(screen.getByTestId('search-bar-spinner')).toBeInTheDocument();
  });

  it('does NOT trigger onSearch while isLoading even if the user clicks (FR-002 c)', async () => {
    const handler = vi.fn();
    const user = userEvent.setup();
    render(<SearchPanel onSearch={handler} isLoading />);
    await user.type(screen.getByTestId('search-bar-input'), 'busy');
    await user.click(screen.getByTestId('search-bar-submit'));
    expect(handler).not.toHaveBeenCalled();
  });
});
