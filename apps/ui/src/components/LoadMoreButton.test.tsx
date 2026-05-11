/**
 * Unit tests for LoadMoreButton (FR-006).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoadMoreButton } from './LoadMoreButton.js';

describe('LoadMoreButton', () => {
  it('renders the button with "Load more" text when not loading', () => {
    const onClick = vi.fn();
    const { container } = render(<LoadMoreButton onClick={onClick} isLoading={false} />);

    const button = container.querySelector('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Load more');
  });

  it('calls onClick when clicked (FR-006 acceptance criterion a)', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(<LoadMoreButton onClick={onClick} isLoading={false} />);

    const button = container.querySelector('button');
    expect(button).toBeInTheDocument();
    await user.click(button!);

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('shows a spinner when isLoading is true (FR-006 acceptance criterion b)', () => {
    const onClick = vi.fn();
    const { container } = render(<LoadMoreButton onClick={onClick} isLoading={true} />);

    expect(screen.getByText(/Loading.../i)).toBeInTheDocument();
    // The spinner SVG is present.
    const button = container.querySelector('button');
    expect(button?.querySelector('svg.animate-spin')).toBeInTheDocument();
  });

  it('disables the button when isLoading is true', () => {
    const onClick = vi.fn();
    const { container } = render(<LoadMoreButton onClick={onClick} isLoading={true} />);

    const button = container.querySelector('button');
    expect(button).toBeDisabled();
  });

  it('disables the button when disabled prop is true', () => {
    const onClick = vi.fn();
    const { container } = render(
      <LoadMoreButton onClick={onClick} isLoading={false} disabled={true} />,
    );

    const button = container.querySelector('button');
    expect(button).toBeDisabled();
  });

  it('hides the spinner when isLoading becomes false (FR-006 acceptance criterion b)', () => {
    const onClick = vi.fn();
    const { rerender, container } = render(<LoadMoreButton onClick={onClick} isLoading={true} />);

    let button = container.querySelector('button');
    expect(button).toHaveTextContent('Loading...');

    rerender(<LoadMoreButton onClick={onClick} isLoading={false} />);

    button = container.querySelector('button');
    expect(button).toHaveTextContent('Load more');
    expect(button?.querySelector('svg.animate-spin')).not.toBeInTheDocument();
  });
});
