/**
 * `@neo-search/ui-tokens/preset` — the Tailwind preset that encodes the NFR-002 visual
 * system as configuration. Consumed by `apps/ui/tailwind.config.ts` via the `presets`
 * array; downstream UI stories MUST NOT redefine palette / typography / spacing locally.
 *
 * Returning a plain object (not invoking `tailwindcss/plugin`) keeps the preset Node-
 * pure so it can be unit-tested without booting Tailwind itself — see `preset.test.ts`.
 */

import { breakpoints, cardStyles, focusRing, palette, spacing, typography } from './tokens.js';

/**
 * Shape narrowed enough that `tailwind.config.ts` consumes it under `presets: [preset]`
 * without needing a Tailwind type import. The full Tailwind `Config` type is more
 * permissive than what we actually populate.
 */
export interface UiTokensPreset {
  theme: {
    screens: Record<string, string>;
    extend: {
      colors: typeof palette;
      fontSize: typeof typography;
      spacing: typeof spacing;
      borderRadius: (typeof cardStyles)['borderRadius'];
      boxShadow: (typeof cardStyles)['boxShadow'];
      ringColor: (typeof focusRing)['ringColor'];
      ringWidth: (typeof focusRing)['ringWidth'];
      ringOffsetColor: (typeof focusRing)['ringOffsetColor'];
    };
  };
}

/**
 * The preset itself. `screens` REPLACES Tailwind's defaults so the 320px `xs` breakpoint
 * is the documented floor — NFR-001's contractual minimum width.
 */
export const preset: UiTokensPreset = {
  theme: {
    screens: { ...breakpoints },
    extend: {
      colors: palette,
      fontSize: typography,
      spacing,
      borderRadius: cardStyles.borderRadius,
      boxShadow: cardStyles.boxShadow,
      ringColor: focusRing.ringColor,
      ringWidth: focusRing.ringWidth,
      ringOffsetColor: focusRing.ringOffsetColor,
    },
  },
};

export default preset;
