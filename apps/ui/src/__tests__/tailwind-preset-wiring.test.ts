/**
 * STORY-014 acceptance criterion 5 (`tailwind.config.ts` MUST consume the preset
 * via the `presets` array). This test imports the actual Tailwind config used by
 * `apps/ui` and asserts the preset reference is present and shaped correctly.
 *
 * Why a test rather than just trust the config: a future edit could silently drop
 * `presets: [preset]` (or replace it with a redefinition that diverges from the
 * tokens). The test catches both regressions in a single assertion.
 */
import { describe, it, expect } from 'vitest';
import { preset as canonicalPreset } from '@neo-search/ui-tokens';
import tailwindConfig from '../../tailwind.config.js';

describe('STORY-014 acceptance: apps/ui consumes @neo-search/ui-tokens via tailwind presets', () => {
  it('apps/ui/tailwind.config.ts declares a presets array containing the ui-tokens preset', () => {
    expect(Array.isArray(tailwindConfig.presets)).toBe(true);
    expect(tailwindConfig.presets?.length ?? 0).toBeGreaterThan(0);
  });

  it('the wired preset has the canonical xs:320px breakpoint (NFR-001 floor)', () => {
    const wired = (tailwindConfig.presets ?? [])[0] as unknown as typeof canonicalPreset;
    expect(wired.theme?.screens).toEqual(canonicalPreset.theme.screens);
  });

  it('the wired preset re-exposes the canonical palette (no shell-side override)', () => {
    const wired = (tailwindConfig.presets ?? [])[0] as unknown as typeof canonicalPreset;
    expect(wired.theme?.extend?.colors).toEqual(canonicalPreset.theme.extend.colors);
  });

  it('apps/ui/tailwind.config.ts content globs cover index.html and src/**.{ts,tsx}', () => {
    const content = tailwindConfig.content as string[];
    expect(content).toContain('./index.html');
    expect(content).toContain('./src/**/*.{ts,tsx}');
  });
});
