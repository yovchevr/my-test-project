/**
 * STORY-018 / I-20 — no cyclic imports.
 *
 * Per `.design/foundation/conventions.md`:
 *   "Circular imports MUST NOT exist. CI MUST run `madge --circular` (or
 *    equivalent) and fail on a hit."
 *
 * Per `.design/technology/testing.md` (gates table):
 *   "Cycle check | `madge --circular --extensions ts,tsx .` | Any cyclic
 *    import (I-20)."
 *
 * This integration test executes the same `madge --circular` invocation the
 * CI workflow uses. It runs once per PR; a regression that introduces a cycle
 * fails this test in addition to the standalone `pnpm madge` script.
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

describe('STORY-018 / I-20 — madge --circular reports zero cycles', () => {
  it('I-20: madge --circular --extensions ts,tsx exits 0 against the source tree', () => {
    let output = '';
    let exitCode = 0;
    try {
      output = execSync('pnpm exec madge --circular --extensions ts,tsx apps services packages', {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      const e = err as { status?: number; stdout?: string; stderr?: string };
      exitCode = e.status ?? 1;
      output = (e.stdout ?? '') + (e.stderr ?? '');
    }
    expect(exitCode, `madge output:\n${output}`).toBe(0);
  }, 60_000);
});
