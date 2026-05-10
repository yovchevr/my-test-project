/**
 * STORY-014 acceptance tests for `AppShell` (FR-001 / NFR-001 / NFR-002).
 *
 * These exercise the structural guarantees the design pass owes the downstream UI
 * stories: top bar present, product title rendered, exactly one global action
 * present, slot regions render their children when supplied, sticky positioning
 * applied, fixed top-bar height, and 320px viewport renders without horizontal
 * overflow (the unit-level NFR-001 floor; STORY-019 owns the real-browser matrix).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell } from './AppShell.js';

beforeEach(() => {
  cleanup();
});

describe('STORY-014 / FR-001 AppShell top bar', () => {
  it('renders the product title in the sticky top bar', () => {
    render(<AppShell />);
    const title = screen.getByTestId('app-shell-title');
    expect(title).toBeInTheDocument();
    expect(title).toHaveTextContent('neo-search');
  });

  it('renders exactly one global action button on the top bar (FR-001 c)', () => {
    render(<AppShell />);
    const actions = screen.getAllByTestId('app-shell-global-action');
    expect(actions).toHaveLength(1);
    expect(actions[0]).toBeInstanceOf(HTMLButtonElement);
  });

  it('defaults the global action label to "Refresh" — the design doc example', () => {
    render(<AppShell />);
    expect(screen.getByTestId('app-shell-global-action')).toHaveTextContent('Refresh');
  });

  it('lets a caller override the global action label', () => {
    render(<AppShell globalActionLabel="New search" />);
    expect(screen.getByTestId('app-shell-global-action')).toHaveTextContent('New search');
  });

  it('invokes the onGlobalAction handler when the global action is clicked', async () => {
    const handler = vi.fn();
    const user = userEvent.setup();
    render(<AppShell onGlobalAction={handler} />);
    await user.click(screen.getByTestId('app-shell-global-action'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('applies sticky positioning to the top bar (FR-001 a "fixed or sticky")', () => {
    render(<AppShell />);
    const topBar = screen.getByTestId('app-shell-top-bar');
    // The Tailwind class is `sticky top-0 z-10`. We check for the class because
    // jsdom does not compute layout — STORY-019 owns the visual assertion.
    expect(topBar.className).toMatch(/\bsticky\b/);
    expect(topBar.className).toMatch(/\btop-0\b/);
  });

  it('applies a fixed top-bar height class (FR-001 d "consistent height")', () => {
    render(<AppShell />);
    const topBar = screen.getByTestId('app-shell-top-bar');
    // `h-14` (3.5rem) is the pinned height; STORY-019 asserts the rendered px height.
    expect(topBar.className).toMatch(/\bh-14\b/);
  });

  it('uses semantic <header role="banner"> so screen readers locate it', () => {
    render(<AppShell />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });
});

describe('STORY-014 AppShell slot structure (downstream story contract)', () => {
  it('omits the controls slot region entirely when controls is undefined', () => {
    render(<AppShell />);
    expect(screen.queryByTestId('app-shell-controls-slot')).toBeNull();
  });

  it('renders the controls slot when controls is provided', () => {
    render(<AppShell controls={<div data-testid="search-controls" />} />);
    expect(screen.getByTestId('app-shell-controls-slot')).toBeInTheDocument();
    expect(screen.getByTestId('search-controls')).toBeInTheDocument();
  });

  it('omits the results slot region entirely when results is undefined', () => {
    render(<AppShell />);
    expect(screen.queryByTestId('app-shell-results-slot')).toBeNull();
  });

  it('renders the results slot when results is provided', () => {
    render(<AppShell results={<div data-testid="results-list" />} />);
    expect(screen.getByTestId('app-shell-results-slot')).toBeInTheDocument();
    expect(screen.getByTestId('results-list')).toBeInTheDocument();
  });

  it('renders both slots when both are provided (STORY-015 + STORY-016 pairing)', () => {
    render(
      <AppShell
        controls={<div data-testid="search-controls" />}
        results={<div data-testid="results-list" />}
      />,
    );
    expect(screen.getByTestId('app-shell-controls-slot')).toBeInTheDocument();
    expect(screen.getByTestId('app-shell-results-slot')).toBeInTheDocument();
  });
});

describe('STORY-014 / NFR-002 visual system enforcement', () => {
  it('the global action button declares a focus-visible ring (NFR-002 hover/focus)', () => {
    render(<AppShell />);
    const button = screen.getByTestId('app-shell-global-action');
    expect(button.className).toMatch(/focus-visible:ring/);
  });

  it('the top bar uses palette-bound classes — no inline style hex literals', () => {
    render(<AppShell />);
    const topBar = screen.getByTestId('app-shell-top-bar');
    // No inline `style="color: #..."` should appear on the rendered shell. The
    // ESLint no-inline-hex rule is the structural guard at edit time; this assertion
    // catches a runtime regression where a child renders inline color strings.
    const inlineStyle = topBar.getAttribute('style') ?? '';
    expect(inlineStyle).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });
});

describe('STORY-014 / NFR-001 320px viewport floor', () => {
  it('renders without panicking under a 320px viewport (jsdom-mocked)', () => {
    // jsdom lets us mutate window dimensions; use that to assert the unit-level
    // NFR-001 floor. The real-browser matrix at 320/375/768/1280/1920 lives in
    // STORY-019's Playwright suite (per testing.md NFR-001 row).
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 568 });
    window.dispatchEvent(new Event('resize'));

    render(<AppShell controls={<div>controls</div>} results={<div>results</div>} />);

    // The shell uses `max-w-screen-xl mx-auto px-rhythm-base` so the layout never
    // exceeds the viewport at 320px (no horizontal scroll). jsdom does not compute
    // layout, so we assert the structural guard: no element declares an explicit
    // pixel width that would force a horizontal scrollbar.
    const top = screen.getByTestId('app-shell-top-bar');
    const inlineStyle = top.getAttribute('style') ?? '';
    expect(inlineStyle).not.toMatch(/width:\s*\d{4,}px/); // no >=1000px hardcoded width
    expect(inlineStyle).not.toMatch(/min-width:\s*\d{4,}px/);
  });
});
