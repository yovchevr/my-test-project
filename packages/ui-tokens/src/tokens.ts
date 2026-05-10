/**
 * `@neo-search/ui-tokens/tokens` — the documented design-system tokens for the prototype
 * (NFR-002 visual system: palette, typography, spacing, cards, hover/focus).
 *
 * The exact palette values pin the "Open follow-ups" item from `.design/components/ui-shell.md`:
 * the design pass deliberately deferred concrete hex values to the developer's first UI pass.
 * STORY-014 IS that first UI pass, so these values become the contract surface that
 * downstream UI stories (STORY-015..STORY-017) MUST consume verbatim.
 *
 * Failure mode: any consumer that uses an inline hex outside this module is a structural
 * NFR-002 regression and is caught by the no-inline-hex ESLint rule wired in `apps/ui`.
 */

/**
 * Color palette tokens. Names follow `.design/components/ui-shell.md` Scope §2:
 * `primary`, `surface`, `text-default`, `text-muted`, `border`, `error`, `success`.
 *
 * The `.50` ... `.900` ramps follow Tailwind's familiar shade convention so
 * `bg-primary-600 hover:bg-primary-700` reads naturally in JSX.
 */
export const palette = {
  primary: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#1e40af',
    900: '#1e3a8a',
    DEFAULT: '#2563eb',
  },
  surface: {
    DEFAULT: '#ffffff',
    raised: '#ffffff',
    sunken: '#f8fafc',
    overlay: '#f1f5f9',
  },
  'text-default': '#0f172a',
  'text-muted': '#475569',
  border: {
    DEFAULT: '#e2e8f0',
    strong: '#cbd5e1',
  },
  error: {
    50: '#fef2f2',
    500: '#ef4444',
    600: '#dc2626',
    DEFAULT: '#dc2626',
  },
  success: {
    50: '#f0fdf4',
    500: '#22c55e',
    600: '#16a34a',
    DEFAULT: '#16a34a',
  },
} as const;

/**
 * Typography scale. Names map 1:1 to NFR-002's documented checklist items.
 * Each entry is `[fontSizeRem, { lineHeight }]` in Tailwind's preset format.
 */
export const typography = {
  display: ['2.25rem', { lineHeight: '2.5rem', fontWeight: '700', letterSpacing: '-0.02em' }],
  heading: ['1.5rem', { lineHeight: '2rem', fontWeight: '600', letterSpacing: '-0.01em' }],
  body: ['1rem', { lineHeight: '1.5rem', fontWeight: '400' }],
  caption: ['0.875rem', { lineHeight: '1.25rem', fontWeight: '400' }],
} as const;

/**
 * Spacing rhythm — 4 / 8 / 16 / 24 / 32 px per the story's Scope §3.
 *
 * Tailwind ships its own spacing scale; we ADD named tokens that read intent-first
 * (`gap-rhythm-tight`, `p-rhythm-card`) without removing Tailwind's numeric scale.
 * The numeric scale is what Tailwind utilities like `p-4` continue to use.
 */
export const spacing = {
  'rhythm-xtight': '0.25rem',
  'rhythm-tight': '0.5rem',
  'rhythm-base': '1rem',
  'rhythm-loose': '1.5rem',
  'rhythm-xloose': '2rem',
} as const;

/**
 * Card radius + elevation tokens. The shell's results list (STORY-016) and the
 * answer renderer (STORY-017) both render card-shaped containers and MUST consume
 * these tokens — never re-pick a corner radius.
 */
export const cardStyles = {
  borderRadius: {
    card: '0.75rem',
    'card-sm': '0.5rem',
  },
  boxShadow: {
    card: '0 1px 2px 0 rgb(15 23 42 / 0.06), 0 1px 3px 0 rgb(15 23 42 / 0.04)',
    'card-elevated': '0 4px 6px -1px rgb(15 23 42 / 0.08), 0 2px 4px -2px rgb(15 23 42 / 0.05)',
  },
} as const;

/**
 * Hover / focus utilities. NFR-002 mandates a visible focus ring on every interactive
 * element. We expose the ring color as a token so utility classes stay palette-bound.
 */
export const focusRing = {
  ringColor: {
    focus: '#2563eb',
    'focus-strong': '#1d4ed8',
  },
  ringWidth: {
    focus: '2px',
  },
  ringOffsetColor: {
    focus: '#ffffff',
  },
} as const;

/**
 * Responsive breakpoints. The 320px floor (`xs`) is what the NFR-001 acceptance
 * criterion stresses; downstream Playwright (STORY-019) parameterizes over this set.
 */
export const breakpoints = {
  xs: '320px',
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
} as const;

/**
 * Aggregate token surface. Useful for tests that want to walk every shape at once.
 */
export const tokens = {
  palette,
  typography,
  spacing,
  cardStyles,
  focusRing,
  breakpoints,
} as const;

export type PaletteToken = keyof typeof palette;
export type TypographyToken = keyof typeof typography;
export type SpacingToken = keyof typeof spacing;
export type BreakpointToken = keyof typeof breakpoints;
