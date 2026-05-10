# `@neo-search/ui-tokens`

The design-system tokens for the neo-search UI shell. This package is the SOLE
legal source of color, typography, spacing, card, and focus-ring values across
the UI — `apps/ui` consumes it via the Tailwind `presets` array, and an ESLint
rule forbids inline hex literals anywhere in `apps/ui/src/**` outside of this
package itself.

This is the structural guard NFR-002 names: "ad-hoc inline colors outside the
palette MUST NOT appear." Lint catches a regression at PR time, the unit test
catches an accidental rename of a token, and the Playwright visual diff (owned
by STORY-019) catches a value drift at runtime.

## What's pinned here

The `.design/components/ui-shell.md` "Open follow-ups" item explicitly deferred
the concrete Tailwind palette values to "the developer agent's first UI pass."
STORY-014 IS that first UI pass, so the values below become the contract surface
that downstream UI stories (STORY-015..STORY-017) MUST consume verbatim.

## Public surface

```ts
import {
  preset, // the Tailwind preset (consumed by apps/ui/tailwind.config.ts)
  palette, // raw color tokens (also useful in tests)
  typography, // font-size + line-height tuples per Tailwind's preset format
  spacing, // 4 / 8 / 16 / 24 / 32 px rhythm
  cardStyles, // border radius + elevation
  focusRing, // ring color / width / offset for NFR-002 focus affordance
  breakpoints, // xs:320px, sm:640px, md:768px, lg:1024px, xl:1280px
  tokens, // aggregate of every bucket above
} from '@neo-search/ui-tokens';
```

## Palette

| Token          | Purpose                                                   |
| -------------- | --------------------------------------------------------- |
| `primary`      | brand color — primary submit, focus accents               |
| `surface`      | background fills (`DEFAULT`, `raised`, `sunken`, overlay) |
| `text-default` | default body text color                                   |
| `text-muted`   | secondary text (captions, metadata)                       |
| `border`       | divider / outline color (`DEFAULT`, `strong`)             |
| `error`        | terminal error state (FR-005) — both fill and text        |
| `success`      | positive feedback affordance                              |

`primary` and `error` / `success` ship with the Tailwind 50→900 ramp so JSX
reads naturally: `bg-primary-600 hover:bg-primary-700 text-surface`.

## Typography scale

| Token     | Size        | Use                                              |
| --------- | ----------- | ------------------------------------------------ |
| `display` | 2.25rem/40  | top-of-page hero text (none in the shell yet)    |
| `heading` | 1.5rem/32   | top-bar product title, results-list section head |
| `body`    | 1rem/24     | default body text                                |
| `caption` | 0.875rem/20 | metadata under cards, helper text                |

## Spacing rhythm

A documented 4 / 8 / 16 / 24 / 32 px scale, exposed as named tokens so JSX
expresses intent rather than magic numbers:

```
rhythm-xtight   4px (0.25rem)
rhythm-tight    8px (0.5rem)
rhythm-base    16px (1rem)
rhythm-loose   24px (1.5rem)
rhythm-xloose  32px (2rem)
```

Tailwind's built-in numeric scale (`p-1`, `p-2`, ...) remains available for
fine-grained tweaks — the rhythm tokens are what cards / sections / shells use.

## Cards

```
rounded-card        12px radius (results cards, answer panels, dialog frames)
rounded-card-sm      8px radius (smaller chips and tags)
shadow-card          subtle elevation for resting cards
shadow-card-elevated stronger elevation for active / focused cards
```

## Hover and focus affordances

NFR-002 mandates that every interactive element have a visible focus ring.
The convention in `apps/ui` is:

```tsx
<button
  className="
    rounded-card-sm bg-primary-600 text-surface
    hover:bg-primary-700
    focus-visible:outline-none focus-visible:ring-focus focus-visible:ring-2
    focus-visible:ring-offset-2 focus-visible:ring-offset-focus
  "
>
  ...
</button>
```

`ring-focus` resolves to the same `primary` accent so focus and brand are
visually coherent. Use `focus-visible:` (not `focus:`) so the ring shows for
keyboard users without sticking on every mouse click.

## Slot structure for downstream UI stories

The `AppShell` (STORY-014) hosts two named slots downstream stories drop into.
The diagram below is the contract; STORY-015 / STORY-016 / STORY-017 MUST place
their roots inside these slots and not above them.

```
+------------------------------------------------------------+
|  TopBar  [product title]                  [refresh action] |  <-- STORY-014
+------------------------------------------------------------+
|                                                            |
|  controls slot (STORY-015 search controls drop here)       |
|                                                            |
+------------------------------------------------------------+
|                                                            |
|  results  slot (STORY-016 results / STORY-017 answer)      |
|                                                            |
+------------------------------------------------------------+
```

The `AppShell` component's TSDoc block has the same diagram next to the API.

## Boundary

This package is consumed by `apps/ui` only. It MUST NOT depend on the agent
or data layer; the layering rules in `.design/foundation/architecture.md`
forbid it. (And the no-inline-hex ESLint rule in `apps/ui` enforces the
inverse direction: no hex outside this package.)
