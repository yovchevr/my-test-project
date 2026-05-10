/**
 * STORY-014 acceptance criterion 7: Radix `Tabs` and `Dialog` MUST be installed and
 * importable from `apps/ui` so STORY-015 (filter tabs) and STORY-017 (modal/dialog)
 * have their substrate ready.
 *
 * The assertion is structural: the imports must resolve and the named primitives
 * must be present on the imported module. This catches a regression where a future
 * dependency cleanup drops `@radix-ui/react-*` from `apps/ui/package.json`.
 */
import { describe, it, expect } from 'vitest';
import * as Tabs from '@radix-ui/react-tabs';
import * as Dialog from '@radix-ui/react-dialog';

describe('STORY-014 / Radix substrate available to apps/ui', () => {
  it('imports @radix-ui/react-tabs and exposes the Tabs primitive set', () => {
    expect(Tabs.Root).toBeDefined();
    expect(Tabs.List).toBeDefined();
    expect(Tabs.Trigger).toBeDefined();
    expect(Tabs.Content).toBeDefined();
  });

  it('imports @radix-ui/react-dialog and exposes the Dialog primitive set', () => {
    expect(Dialog.Root).toBeDefined();
    expect(Dialog.Trigger).toBeDefined();
    expect(Dialog.Content).toBeDefined();
    expect(Dialog.Title).toBeDefined();
  });
});
