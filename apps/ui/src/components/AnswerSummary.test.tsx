/**
 * Unit tests for AnswerSummary (FR-007, FR-008, AC#1, AC#2).
 *
 * Coverage:
 * - Inline `[N]` markers render as anchors pointing at `#ref-N`.
 * - Clicking or pressing Enter on a marker scrolls/focuses the matching ref entry.
 * - Text with no markers renders as-is.
 * - Invalid markers (e.g. `[1.5x]`) render as literal text, not anchors.
 * - Defense in depth: a marker pointing at a non-existent reference logs a warning
 *   but does not crash (adversarial coverage per Test plan).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnswerSummary } from './AnswerSummary.js';

describe('AnswerSummary', () => {
  beforeEach(() => {
    // Mock scrollIntoView and focus (not implemented in jsdom).
    Element.prototype.scrollIntoView = vi.fn();
    HTMLElement.prototype.focus = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the answer summary text', () => {
    const answerSummary = 'This is a sample answer with no citations.';
    render(<AnswerSummary answerSummary={answerSummary} />);

    expect(screen.getByText('This is a sample answer with no citations.')).toBeInTheDocument();
  });

  it('converts inline [N] markers into anchor elements pointing at #ref-N (AC#1)', () => {
    const answerSummary = 'TypeScript is a superset of JavaScript [1]. It adds static types [2].';
    render(<AnswerSummary answerSummary={answerSummary} />);

    const anchor1 = screen.getByRole('link', { name: /citation 1/i });
    const anchor2 = screen.getByRole('link', { name: /citation 2/i });

    expect(anchor1).toBeInTheDocument();
    expect(anchor1).toHaveAttribute('href', '#ref-1');
    expect(anchor1).toHaveTextContent('[1]');

    expect(anchor2).toBeInTheDocument();
    expect(anchor2).toHaveAttribute('href', '#ref-2');
    expect(anchor2).toHaveTextContent('[2]');
  });

  it('renders text without markers as-is (no anchors)', () => {
    const answerSummary = 'Plain text with no citations at all.';
    render(<AnswerSummary answerSummary={answerSummary} />);

    const links = screen.queryAllByRole('link');
    expect(links).toHaveLength(0);
  });

  it('treats non-numeric bracket content as literal text (e.g. [1.5x])', () => {
    const answerSummary = 'The system runs at [1.5x] speed. It uses [1] core.';
    render(<AnswerSummary answerSummary={answerSummary} />);

    // Only `[1]` should be an anchor; `[1.5x]` should render as text.
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent('[1]');

    // The literal `[1.5x]` is present as text.
    expect(screen.getByText(/\[1\.5x\]/)).toBeInTheDocument();
  });

  it('scrolls and focuses the matching ref entry when a marker is clicked (AC#2)', async () => {
    const user = userEvent.setup();
    const answerSummary = 'TypeScript is a superset of JavaScript [1].';

    // Create a mock target element so `getElementById` can find it.
    const mockTarget = document.createElement('div');
    mockTarget.id = 'ref-1';
    mockTarget.tabIndex = -1;
    document.body.appendChild(mockTarget);

    render(<AnswerSummary answerSummary={answerSummary} />);

    const anchor = screen.getByRole('link', { name: /citation 1/i });
    await user.click(anchor);

    expect(mockTarget.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
    });
    expect(mockTarget.focus).toHaveBeenCalledWith({ preventScroll: true });

    document.body.removeChild(mockTarget);
  });

  it('scrolls and focuses the matching ref entry when Enter is pressed on a marker (AC#2)', () => {
    const answerSummary = 'TypeScript adds static types [2].';

    const mockTarget = document.createElement('div');
    mockTarget.id = 'ref-2';
    mockTarget.tabIndex = -1;
    document.body.appendChild(mockTarget);

    const { container } = render(<AnswerSummary answerSummary={answerSummary} />);

    const anchors = container.querySelectorAll('a[aria-label="Citation 2"]');
    expect(anchors.length).toBe(1);
    const anchor = anchors[0] as HTMLElement;

    // Simulate pressing Enter on the anchor
    fireEvent.keyDown(anchor, { key: 'Enter', code: 'Enter', charCode: 13 });

    expect(mockTarget.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
    });
    expect(mockTarget.focus).toHaveBeenCalledWith({ preventScroll: true });

    document.body.removeChild(mockTarget);
  });

  it('logs a warning but does not crash when a marker points at a non-existent reference (defense in depth)', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const user = userEvent.setup();
    const answerSummary = 'This reference does not exist [999].';

    render(<AnswerSummary answerSummary={answerSummary} />);

    const anchor = screen.getByRole('link', { name: /citation 999/i });
    await user.click(anchor);

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Citation marker [999] points at #ref-999'),
    );
    consoleWarnSpy.mockRestore();
  });

  it('is keyboard-focusable (each anchor has tabIndex=0)', () => {
    const answerSummary = 'First [1] and second [2] citations.';
    render(<AnswerSummary answerSummary={answerSummary} />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);

    links.forEach((link) => {
      expect(link).toHaveAttribute('tabIndex', '0');
    });
  });

  it('handles multiple markers in a single paragraph', () => {
    const answerSummary = 'A [1] B [2] C [3] D [4] end.';
    render(<AnswerSummary answerSummary={answerSummary} />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(4);
    expect(links[0]).toHaveTextContent('[1]');
    expect(links[1]).toHaveTextContent('[2]');
    expect(links[2]).toHaveTextContent('[3]');
    expect(links[3]).toHaveTextContent('[4]');
  });
});
