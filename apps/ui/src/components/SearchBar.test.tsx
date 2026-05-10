/**
 * STORY-015 acceptance tests for `SearchBar` (FR-002).
 *
 * Each test name cites the FR/AC it covers per
 * `.design/foundation/naming-conventions.md` ("each FR/NFR MUST have at least one
 * test whose name cites the requirement ID").
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { SearchBar } from './SearchBar.js';

beforeEach(() => {
  cleanup();
});

/**
 * A small controlled-state harness — `SearchBar` is a fully controlled component
 * so the tests need a parent that owns `query` state. Mirrors how `SearchPanel`
 * composes the bar in production.
 */
function ControlledSearchBar(props: {
  initialQuery?: string;
  onSubmit: () => void;
  isLoading?: boolean;
}): JSX.Element {
  const [query, setQuery] = useState(props.initialQuery ?? '');
  return (
    <SearchBar
      query={query}
      onQueryChange={setQuery}
      onSubmit={props.onSubmit}
      isLoading={props.isLoading}
    />
  );
}

describe('STORY-015 / FR-002 SearchBar primary controls', () => {
  it('renders a text input and a primary submit button (FR-002 a, b)', () => {
    render(<ControlledSearchBar onSubmit={vi.fn()} />);
    expect(screen.getByTestId('search-bar-input')).toBeInTheDocument();
    expect(screen.getByTestId('search-bar-submit')).toBeInTheDocument();
    // The submit must be a `<button type="submit">` so Enter inside the input
    // triggers the form-submit pathway across browsers.
    expect(screen.getByTestId('search-bar-submit')).toHaveAttribute('type', 'submit');
  });

  it('exposes the input via an accessible role and label (NFR-002 a11y, FR-002 b)', () => {
    render(<ControlledSearchBar onSubmit={vi.fn()} />);
    // `role="search"` lets screen readers locate the form region; the input itself
    // is reachable by its accessible name "Search query" (visually-hidden label +
    // matching aria-label).
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: /search query/i })).toBeInTheDocument();
  });

  it('clicking the submit button calls onSubmit exactly once (FR-002 b)', async () => {
    const handler = vi.fn();
    const user = userEvent.setup();
    render(<ControlledSearchBar initialQuery="hello" onSubmit={handler} />);
    await user.click(screen.getByTestId('search-bar-submit'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('pressing Enter inside the input calls onSubmit exactly once (FR-002 b)', async () => {
    const handler = vi.fn();
    const user = userEvent.setup();
    render(<ControlledSearchBar initialQuery="hello" onSubmit={handler} />);
    const input = screen.getByTestId('search-bar-input');
    await user.click(input);
    await user.keyboard('{Enter}');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('typing into the input updates the controlled query value', async () => {
    const user = userEvent.setup();
    render(<ControlledSearchBar onSubmit={vi.fn()} />);
    const input = screen.getByTestId('search-bar-input');
    await user.type(input, 'neo search');
    expect(input).toHaveValue('neo search');
  });
});

describe('STORY-015 / FR-002 c SearchBar loading state', () => {
  it('disables the submit button when isLoading is true', () => {
    render(<ControlledSearchBar onSubmit={vi.fn()} isLoading />);
    expect(screen.getByTestId('search-bar-submit')).toBeDisabled();
  });

  it('renders a spinner inside the submit button when isLoading is true', () => {
    render(<ControlledSearchBar onSubmit={vi.fn()} isLoading />);
    expect(screen.getByTestId('search-bar-spinner')).toBeInTheDocument();
  });

  it('hides the spinner when isLoading is false', () => {
    render(<ControlledSearchBar onSubmit={vi.fn()} isLoading={false} />);
    expect(screen.queryByTestId('search-bar-spinner')).toBeNull();
  });

  it('clicking the submit button while isLoading does NOT call onSubmit (FR-002 c)', async () => {
    const handler = vi.fn();
    const user = userEvent.setup();
    render(<ControlledSearchBar initialQuery="hello" onSubmit={handler} isLoading />);
    // userEvent.click on a disabled button is a no-op — we still assert the
    // handler stays untouched, since FR-002 c is the contract.
    await user.click(screen.getByTestId('search-bar-submit'));
    expect(handler).not.toHaveBeenCalled();
  });

  it('pressing Enter while isLoading does NOT call onSubmit (FR-002 c)', async () => {
    const handler = vi.fn();
    const user = userEvent.setup();
    render(<ControlledSearchBar initialQuery="hello" onSubmit={handler} isLoading />);
    const input = screen.getByTestId('search-bar-input');
    await user.click(input);
    await user.keyboard('{Enter}');
    expect(handler).not.toHaveBeenCalled();
  });

  it('marks the submit button as aria-busy while isLoading (NFR-002 a11y)', () => {
    render(<ControlledSearchBar onSubmit={vi.fn()} isLoading />);
    expect(screen.getByTestId('search-bar-submit')).toHaveAttribute('aria-busy', 'true');
  });
});

describe('STORY-015 / FR-002 a + NFR-001 responsive layout', () => {
  it('declares full-width on mobile and max-w-2xl beyond (FR-002 a)', () => {
    render(<ControlledSearchBar onSubmit={vi.fn()} />);
    const form = screen.getByTestId('search-bar');
    // jsdom does not compute layout, so the assertion is structural: the
    // Tailwind classes that encode the responsive rule MUST be present. The
    // real-browser assertion lives in STORY-019's Playwright suite.
    expect(form.className).toMatch(/\bw-full\b/);
    expect(form.className).toMatch(/\bmax-w-2xl\b/);
  });

  it('uses the display typography step so it is the most prominent input (NFR-002)', () => {
    render(<ControlledSearchBar onSubmit={vi.fn()} />);
    const input = screen.getByTestId('search-bar-input');
    // `text-display` is the largest step in `@neo-search/ui-tokens`'s scale —
    // the visual prominence requirement (`Acceptance criteria` bullet 5) is met
    // by token usage at this layer; STORY-019 owns the rendered-px assertion.
    expect(input.className).toMatch(/\btext-display\b/);
  });

  it('renders without panicking under a 320px viewport (NFR-001)', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 568 });
    window.dispatchEvent(new Event('resize'));

    render(<ControlledSearchBar onSubmit={vi.fn()} />);

    // No element MUST declare an explicit pixel width that would force horizontal
    // scrolling at 320px — this mirrors the AppShell's NFR-001 unit-level guard.
    const form = screen.getByTestId('search-bar');
    const inlineStyle = form.getAttribute('style') ?? '';
    expect(inlineStyle).not.toMatch(/width:\s*\d{4,}px/);
    expect(inlineStyle).not.toMatch(/min-width:\s*\d{4,}px/);
  });
});

describe('STORY-015 / NFR-002 visual system enforcement', () => {
  it('declares a focus-visible ring on the input (NFR-002 hover/focus)', () => {
    render(<ControlledSearchBar onSubmit={vi.fn()} />);
    expect(screen.getByTestId('search-bar-input').className).toMatch(/focus-visible:ring/);
  });

  it('declares a focus-visible ring on the submit button (NFR-002 hover/focus)', () => {
    render(<ControlledSearchBar onSubmit={vi.fn()} />);
    expect(screen.getByTestId('search-bar-submit').className).toMatch(/focus-visible:ring/);
  });

  it('renders no inline hex color anywhere in the form (NFR-002, no-inline-hex)', () => {
    render(<ControlledSearchBar onSubmit={vi.fn()} />);
    const form = screen.getByTestId('search-bar');
    // Walk every element and assert no `style` attribute carries a hex literal.
    const allElements = form.querySelectorAll('*');
    for (const element of [form, ...allElements]) {
      const inlineStyle = element.getAttribute('style') ?? '';
      expect(inlineStyle).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    }
  });
});
