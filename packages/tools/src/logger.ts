/**
 * Minimal structured-logger seam for the tool registry.
 *
 * `.design/foundation/conventions.md` requires every log line to be a single
 * JSON object with at least `ts`, `level`, `component`, `event`, and forbids
 * `console.log` in production code. The repo does not yet ship a workspace
 * shared logger module — that lands in a later wave story. Until then, the
 * registry exposes this small `Logger` shape so callers (and tests) can
 * inject any compatible sink (pino, a captured array, etc.). The default
 * sink writes one JSON line to stdout via `process.stdout.write`, which
 * keeps the convention without pulling pino into this package's `package.json`
 * before the shared-logger story formally introduces it.
 *
 * Per `.design/foundation/naming-conventions.md`, the `event` field on every
 * line MUST be `<component>.<verb>` lowercase — for this package the
 * component name is `tools` and the only event is `tools.invoked`.
 */

/**
 * Severity levels recognised by the registry. Aligned with pino's level
 * vocabulary (`info`, `warn`, `error`) so a future swap to the shared logger
 * is a one-line change.
 */
export type LogLevel = 'info' | 'warn' | 'error';

/**
 * The structured shape every `tools.invoked` line emits. The registry never
 * logs free-form messages — every field is keyed.
 */
export interface ToolsInvokedLogFields {
  /** Tool name (kebab-case, FR-022). */
  readonly name: string;
  /** Outcome discriminant: success → `ok`; failure → the error `kind`. */
  readonly outcome: 'ok' | 'validation' | 'terminal' | 'transient';
  /**
   * If validation failed, which schema failed: `input` or `output`. Absent
   * when validation did not fail.
   */
  readonly validationFailedOn?: 'input' | 'output';
  /**
   * Reason discriminant for non-`ok` outcomes that did not stem from a
   * schema mismatch — e.g. `unknown-tool`, `handler-threw`,
   * `cancelled-during-validation`. Optional.
   */
  readonly reason?: string;
}

/**
 * The minimal logger surface the registry depends on. A caller MAY inject any
 * implementation — pino, a test spy, a no-op — as long as `log` accepts the
 * level and the field bag.
 */
export interface Logger {
  log(level: LogLevel, fields: ToolsInvokedLogFields): void;
}

/**
 * Default logger for production use. Emits one JSON object per line via
 * `process.stdout.write`. Avoids `console.log` per
 * `.design/foundation/conventions.md`.
 */
export const defaultLogger: Logger = {
  log(level, fields) {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      component: 'tools',
      event: 'tools.invoked',
      ...fields,
    });
    process.stdout.write(line + '\n');
  },
};

/**
 * Test-friendly silent logger. Discards every line. Used as a default when a
 * caller wants the registry but no I/O — e.g. unit tests that aren't
 * asserting on logs.
 */
export const silentLogger: Logger = {
  log() {
    /* intentionally no-op */
  },
};
