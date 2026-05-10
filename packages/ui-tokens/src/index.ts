/**
 * `@neo-search/ui-tokens` — design-system tokens (NFR-002) for the neo-search UI shell.
 *
 * Public surface:
 *  - `preset`: the Tailwind preset consumed by `apps/ui/tailwind.config.ts`.
 *  - `tokens`, `palette`, `typography`, `spacing`, `cardStyles`, `focusRing`,
 *    `breakpoints`: raw token tables for tests and any non-Tailwind consumer.
 *
 * Boundary: this package MAY be imported by `apps/ui` only. It is the documented seam
 * (`.design/components/ui-shell.md` Layering §) and contains no business logic.
 */

export { preset } from './preset.js';
export type { UiTokensPreset } from './preset.js';
export {
  breakpoints,
  cardStyles,
  focusRing,
  palette,
  spacing,
  tokens,
  typography,
} from './tokens.js';
export type { BreakpointToken, PaletteToken, SpacingToken, TypographyToken } from './tokens.js';
