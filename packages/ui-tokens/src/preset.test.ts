/**
 * STORY-014 acceptance tests for the `@neo-search/ui-tokens` package.
 *
 * These assertions pin the NFR-002 "documented checklist" — palette names, typography
 * scale entries, spacing rhythm values, card styles, and the `xs: 320px` breakpoint
 * (NFR-001 contractual minimum). A regression that renames a token name or drops a
 * required key fails the suite, which is the structural guard the design pass requires.
 */
import { describe, it, expect } from 'vitest';
import {
  breakpoints,
  cardStyles,
  focusRing,
  palette,
  preset,
  spacing,
  tokens,
  typography,
} from './index.js';

describe('STORY-014 / NFR-002 palette tokens', () => {
  it('exposes the documented palette names per ui-shell.md Scope §2', () => {
    // The story names primary, surface, text-default, text-muted, border, error, success.
    expect(palette).toHaveProperty('primary');
    expect(palette).toHaveProperty('surface');
    expect(palette).toHaveProperty('text-default');
    expect(palette).toHaveProperty('text-muted');
    expect(palette).toHaveProperty('border');
    expect(palette).toHaveProperty('error');
    expect(palette).toHaveProperty('success');
  });

  it('every palette color value is a hex literal — tokens are the SOLE legal source of hex', () => {
    const hexPattern = /^#[0-9a-fA-F]{3,8}$/;
    const walk = (node: unknown): void => {
      if (typeof node === 'string') {
        expect(hexPattern.test(node), `non-hex palette value: ${node}`).toBe(true);
      } else if (node && typeof node === 'object') {
        for (const value of Object.values(node)) walk(value);
      }
    };
    walk(palette);
  });
});

describe('STORY-014 / NFR-002 typography scale', () => {
  it('exposes display / heading / body / caption per ui-shell.md Scope §2', () => {
    expect(typography).toHaveProperty('display');
    expect(typography).toHaveProperty('heading');
    expect(typography).toHaveProperty('body');
    expect(typography).toHaveProperty('caption');
  });

  it('every entry is the [size, options] tuple Tailwind expects', () => {
    for (const [name, value] of Object.entries(typography)) {
      expect(Array.isArray(value), `${name} must be a tuple`).toBe(true);
      expect(value.length).toBe(2);
      expect(typeof value[0]).toBe('string'); // font-size in rem
      expect(value[1]).toHaveProperty('lineHeight');
    }
  });
});

describe('STORY-014 / NFR-002 spacing rhythm', () => {
  it('encodes the 4 / 8 / 16 / 24 / 32 px scale (rem equivalents)', () => {
    expect(spacing['rhythm-xtight']).toBe('0.25rem'); // 4px
    expect(spacing['rhythm-tight']).toBe('0.5rem'); // 8px
    expect(spacing['rhythm-base']).toBe('1rem'); // 16px
    expect(spacing['rhythm-loose']).toBe('1.5rem'); // 24px
    expect(spacing['rhythm-xloose']).toBe('2rem'); // 32px
  });
});

describe('STORY-014 / NFR-002 card styles', () => {
  it('exposes a card border-radius and an elevation', () => {
    expect(cardStyles.borderRadius).toHaveProperty('card');
    expect(cardStyles.boxShadow).toHaveProperty('card');
    expect(cardStyles.boxShadow).toHaveProperty('card-elevated');
  });
});

describe('STORY-014 / NFR-002 focus ring', () => {
  it('exposes a ring color, width, and offset color so utility classes stay palette-bound', () => {
    expect(focusRing.ringColor).toHaveProperty('focus');
    expect(focusRing.ringWidth).toHaveProperty('focus');
    expect(focusRing.ringOffsetColor).toHaveProperty('focus');
  });
});

describe('STORY-014 / NFR-001 responsive breakpoints', () => {
  it('pins xs to 320px — the contractual minimum width', () => {
    expect(breakpoints.xs).toBe('320px');
  });

  it('exposes the full xs/sm/md/lg/xl set the story names', () => {
    expect(Object.keys(breakpoints).sort()).toEqual(['lg', 'md', 'sm', 'xl', 'xs']);
  });
});

describe('STORY-014 Tailwind preset shape', () => {
  it('exposes theme.screens with the documented breakpoints', () => {
    expect(preset.theme.screens).toEqual(breakpoints);
  });

  it('extends colors / fontSize / spacing / borderRadius / boxShadow', () => {
    const { extend } = preset.theme;
    expect(extend.colors).toBe(palette);
    expect(extend.fontSize).toBe(typography);
    expect(extend.spacing).toBe(spacing);
    expect(extend.borderRadius).toBe(cardStyles.borderRadius);
    expect(extend.boxShadow).toBe(cardStyles.boxShadow);
  });

  it('extends ringColor / ringWidth / ringOffsetColor for the NFR-002 focus-ring utility', () => {
    const { extend } = preset.theme;
    expect(extend.ringColor).toBe(focusRing.ringColor);
    expect(extend.ringWidth).toBe(focusRing.ringWidth);
    expect(extend.ringOffsetColor).toBe(focusRing.ringOffsetColor);
  });
});

describe('STORY-014 aggregate token surface', () => {
  it('the `tokens` aggregate exposes every named bucket', () => {
    expect(tokens.palette).toBe(palette);
    expect(tokens.typography).toBe(typography);
    expect(tokens.spacing).toBe(spacing);
    expect(tokens.cardStyles).toBe(cardStyles);
    expect(tokens.focusRing).toBe(focusRing);
    expect(tokens.breakpoints).toBe(breakpoints);
  });
});
