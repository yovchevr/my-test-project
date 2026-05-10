/**
 * STORY-015 acceptance tests for `SourceFilterBar` (FR-003).
 *
 * Each test name cites the FR/AC it covers per
 * `.design/foundation/naming-conventions.md`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { SourceFilterEnum } from '@neo-search/contracts';
import { SourceFilterBar } from './SourceFilterBar.js';

beforeEach(() => {
  cleanup();
});

/**
 * A controlled-state harness — `SourceFilterBar` is fully controlled. Mirrors
 * how `SearchPanel` composes the bar in production.
 */
function ControlledFilterBar(props: {
  initialValue?: SourceFilterEnum;
  onChange: (next: SourceFilterEnum) => void;
}): JSX.Element {
  const [value, setValue] = useState<SourceFilterEnum>(props.initialValue ?? 'LIVE');
  return (
    <SourceFilterBar
      value={value}
      onChange={(next) => {
        setValue(next);
        props.onChange(next);
      }}
    />
  );
}

describe('STORY-015 / FR-003 SourceFilterBar structure', () => {
  it('renders exactly three triggers (FR-003 b — neither more nor fewer)', () => {
    render(<ControlledFilterBar onChange={vi.fn()} />);
    // Radix tabs render `role="tab"` on each trigger; the count is the contract.
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });

  it('renders the three triggers labeled LIVE, HISTORY, BOOKMARK (FR-003 b)', () => {
    render(<ControlledFilterBar onChange={vi.fn()} />);
    expect(screen.getByTestId('source-filter-trigger-LIVE')).toBeInTheDocument();
    expect(screen.getByTestId('source-filter-trigger-HISTORY')).toBeInTheDocument();
    expect(screen.getByTestId('source-filter-trigger-BOOKMARK')).toBeInTheDocument();
  });

  it('each trigger renders both an icon and a text label (FR-003 c)', () => {
    render(<ControlledFilterBar onChange={vi.fn()} />);
    for (const filter of ['LIVE', 'HISTORY', 'BOOKMARK'] as const) {
      expect(screen.getByTestId(`source-filter-icon-${filter}`)).toBeInTheDocument();
      expect(screen.getByTestId(`source-filter-label-${filter}`)).toHaveTextContent(filter);
    }
  });

  it('uses Radix Tabs ARIA defaults (tablist + tab roles, NFR-002 a11y)', () => {
    render(<ControlledFilterBar onChange={vi.fn()} />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });
});

describe('STORY-015 / FR-003 SourceFilterBar selection behavior', () => {
  it('calls onChange with LIVE when LIVE is selected (FR-003 enum value)', async () => {
    const handler = vi.fn();
    const user = userEvent.setup();
    // Start on HISTORY so clicking LIVE causes a state change.
    render(<ControlledFilterBar initialValue="HISTORY" onChange={handler} />);
    await user.click(screen.getByTestId('source-filter-trigger-LIVE'));
    expect(handler).toHaveBeenCalledWith('LIVE');
  });

  it('calls onChange with HISTORY when HISTORY is selected (FR-003 enum value)', async () => {
    const handler = vi.fn();
    const user = userEvent.setup();
    render(<ControlledFilterBar initialValue="LIVE" onChange={handler} />);
    await user.click(screen.getByTestId('source-filter-trigger-HISTORY'));
    expect(handler).toHaveBeenCalledWith('HISTORY');
  });

  it('calls onChange with BOOKMARK when BOOKMARK is selected (FR-003 enum value)', async () => {
    const handler = vi.fn();
    const user = userEvent.setup();
    render(<ControlledFilterBar initialValue="LIVE" onChange={handler} />);
    await user.click(screen.getByTestId('source-filter-trigger-BOOKMARK'));
    expect(handler).toHaveBeenCalledWith('BOOKMARK');
  });

  it('marks the selected trigger with data-state="active" (AC: visual selection)', async () => {
    const user = userEvent.setup();
    render(<ControlledFilterBar initialValue="LIVE" onChange={vi.fn()} />);
    // Initial: LIVE is active.
    expect(screen.getByTestId('source-filter-trigger-LIVE')).toHaveAttribute(
      'data-state',
      'active',
    );
    // After selecting BOOKMARK, the active marker MUST move.
    await user.click(screen.getByTestId('source-filter-trigger-BOOKMARK'));
    expect(screen.getByTestId('source-filter-trigger-BOOKMARK')).toHaveAttribute(
      'data-state',
      'active',
    );
    expect(screen.getByTestId('source-filter-trigger-LIVE')).toHaveAttribute(
      'data-state',
      'inactive',
    );
  });

  it('reflects the controlled `value` prop on initial render (default LIVE here)', () => {
    render(<ControlledFilterBar initialValue="LIVE" onChange={vi.fn()} />);
    expect(screen.getByTestId('source-filter-trigger-LIVE')).toHaveAttribute(
      'data-state',
      'active',
    );
    expect(screen.getByTestId('source-filter-trigger-HISTORY')).toHaveAttribute(
      'data-state',
      'inactive',
    );
    expect(screen.getByTestId('source-filter-trigger-BOOKMARK')).toHaveAttribute(
      'data-state',
      'inactive',
    );
  });
});

describe('STORY-015 / NFR-002 SourceFilterBar visual system enforcement', () => {
  it('declares a focus-visible ring on each trigger (NFR-002 hover/focus)', () => {
    render(<ControlledFilterBar onChange={vi.fn()} />);
    for (const filter of ['LIVE', 'HISTORY', 'BOOKMARK'] as const) {
      const trigger = screen.getByTestId(`source-filter-trigger-${filter}`);
      expect(trigger.className).toMatch(/focus-visible:ring/);
    }
  });

  it('renders no inline hex color anywhere in the bar (NFR-002, no-inline-hex)', () => {
    render(<ControlledFilterBar onChange={vi.fn()} />);
    const bar = screen.getByTestId('source-filter-bar');
    const allElements = bar.querySelectorAll('*');
    for (const element of [bar, ...allElements]) {
      const inlineStyle = element.getAttribute('style') ?? '';
      expect(inlineStyle).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    }
  });
});
