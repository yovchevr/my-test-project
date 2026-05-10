/**
 * Tailwind config for `apps/ui`. Extends `@neo-search/ui-tokens`'s preset (NFR-002):
 * the preset is the SOLE source of palette / typography / spacing / cards / focus-ring
 * tokens. Adding a new color or font-size MUST go through `packages/ui-tokens`, never
 * inline here — the no-inline-hex ESLint rule on `apps/ui/src/**` enforces the inverse.
 */
import type { Config } from 'tailwindcss';
import { preset } from '@neo-search/ui-tokens';

// Cast at the import seam: `tailwindcss`'s `Config['presets']` is typed as a union
// of `Partial<Config>` and a function form. Our preset is structurally compatible
// (it sets `theme.screens` + `theme.extend.*`) but the variance on Tailwind's
// recursive `RecursiveKeyValuePair` type makes a direct assignment too narrow.
// `unknown` here is a contained, single-line cast — no token shape leaks into
// the runtime. The `preset.test.ts` regression test catches a structural drift.
const presetForTailwind = preset as unknown as Partial<Config>;

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  presets: [presetForTailwind],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
