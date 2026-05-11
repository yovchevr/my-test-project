/**
 * Unit tests for ErrorState (FR-005).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ApiError } from '../api-client.js';
import { ErrorState } from './ErrorState.js';

describe('ErrorState', () => {
  it('renders validation error copy (FR-005 acceptance criterion b)', () => {
    const error: ApiError = { kind: 'validation', message: 'Invalid query' };
    render(<ErrorState error={error} />);

    expect(screen.getByText('Invalid search')).toBeInTheDocument();
    expect(screen.getByText(/Your search couldn't be processed/i)).toBeInTheDocument();
  });

  it('renders terminal error copy (FR-005 acceptance criterion b)', () => {
    const error: ApiError = { kind: 'terminal', message: 'Service down' };
    render(<ErrorState error={error} />);

    expect(screen.getByText('Service unavailable')).toBeInTheDocument();
    expect(screen.getByText(/The search service is unavailable/i)).toBeInTheDocument();
  });

  it('renders transient_exhausted error copy (FR-005 acceptance criterion b)', () => {
    const error: ApiError = { kind: 'transient_exhausted', message: 'Retries exhausted' };
    render(<ErrorState error={error} />);

    expect(screen.getByText('Connection error')).toBeInTheDocument();
    expect(screen.getByText(/We couldn't reach the search service/i)).toBeInTheDocument();
  });

  it('renders cancelled error copy (FR-005 acceptance criterion b)', () => {
    const error: ApiError = { kind: 'cancelled', message: 'Timeout' };
    render(<ErrorState error={error} />);

    expect(screen.getByText('Search timed out')).toBeInTheDocument();
    expect(screen.getByText(/The search took too long/i)).toBeInTheDocument();
  });

  it('renders network error copy', () => {
    const error: ApiError = { kind: 'network', message: 'Fetch failed' };
    render(<ErrorState error={error} />);

    expect(screen.getByText('Network error')).toBeInTheDocument();
    expect(screen.getByText(/A network error occurred/i)).toBeInTheDocument();
  });

  it('renders internal error copy as fallback', () => {
    const error: ApiError = { kind: 'internal', message: 'Unknown' };
    render(<ErrorState error={error} />);

    expect(screen.getByText('Unexpected error')).toBeInTheDocument();
    expect(screen.getByText(/An unexpected error occurred/i)).toBeInTheDocument();
  });

  it('follows the same visual system as the populated list (FR-005 acceptance criterion d)', () => {
    const error: ApiError = { kind: 'terminal', message: 'Service down' };
    const { container } = render(<ErrorState error={error} />);

    const errorDiv = container.querySelector('div');
    expect(errorDiv).toHaveClass('rounded-lg');
    expect(errorDiv).toHaveClass('bg-white');
    expect(errorDiv).toHaveClass('shadow-md');
  });
});
