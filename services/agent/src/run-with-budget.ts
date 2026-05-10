/**
 * `runWithBudget` — the SHARED retry helper for the agent (STORY-011, NFR-005,
 * FR-023, OQ-001).
 *
 * Per `.design/components/agent.md`'s "Retry helper" section:
 *  - retries on `error.kind === "transient"` only;
 *  - non-`transient` errors short-circuit immediately;
 *  - `maxAttempts: 3` (1 initial + 2 retries);
 *  - fixed `backoffMs: 500` between attempts (no exponential ramp, no jitter);
 *  - the budget timer (`totalMs: 10_000`) and the upstream `signal` together
 *    derive a single `AbortSignal` passed to every attempt;
 *  - when the budget elapses or the upstream `signal` aborts, the helper
 *    returns `{ ok: false, error: { kind: "cancelled" } }` even mid-retry —
 *    no further attempts run, the in-flight attempt's own `signal` is
 *    aborted so the tool can tear down.
 *
 * Per I-27, the shared helper MUST be the only place in the agent that
 * implements retry logic. The static AST scan in STORY-018 enforces this.
 *
 * Per `.design/foundation/conventions.md` "Determinism", the wait between
 * attempts MUST be timed via the injected `Clock` — `setTimeout(..., 500)`
 * directly would read real wall time inside business logic. The clock seam
 * is what makes the NFR-005 sub-cases (a)..(e) testable without `vi.useFakeTimers`
 * driving every call site.
 *
 * This helper is the SOLE place permitted to derive an `AbortSignal` from a
 * budget timer. All other call sites MUST forward an existing signal
 * unchanged. STORY-018's AST scan asserts this.
 */
import type { Result, ToolErrorContract } from '@neo-search/contracts';
import type { AgentErrorContract } from '@neo-search/contracts';

/**
 * Time-source seam injected into `runWithBudget`. The helper schedules two
 * kinds of waits:
 *  - the per-attempt backoff between retries (`wait(ms)`);
 *  - the request-budget elapse (`wait(totalMs)`), which races against the
 *    in-flight attempt.
 *
 * Tests inject a fake clock whose `wait(ms)` resolves on a manually-driven
 * tick queue so the five NFR-005 sub-cases (a)..(e) can be verified
 * deterministically. Production binds a wall-clock implementation built on
 * `setTimeout`.
 */
export interface Clock {
  /**
   * Resolves after `ms` wall-clock milliseconds (or the test-controlled
   * equivalent). MUST honor `signal`: if `signal` aborts before the wait
   * completes, the returned promise MUST resolve early — the cancellation
   * path uses this resolution to short-circuit the post-wait code.
   *
   * The promise itself MUST NOT reject on cancellation — the helper inspects
   * the signal state after each `wait` to drive the cancelled-error branch.
   */
  wait(ms: number, signal: AbortSignal): Promise<void>;
}

/**
 * Production wall-clock `Clock`. Schedules a `setTimeout` and clears it on
 * abort so the timer does not keep the event loop alive past the abort.
 *
 * This is the SOLE `setTimeout` reference allowed in the agent's source
 * tree (per the NFR-005 retry-helper scope). Tests in `run-with-budget.test.ts`
 * inject a fake clock so they never observe real wall time.
 */
export const wallClock: Clock = {
  wait(ms, signal) {
    return new Promise<void>((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = (): void => {
        clearTimeout(timer);
        resolve();
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
  },
};

/**
 * Retry policy parameters. The defaults exposed by `DEFAULT_RETRY_POLICY`
 * match NFR-005 / OQ-001 verbatim: 3 attempts, 500ms fixed backoff.
 */
export interface RetryPolicy {
  /** Total number of attempts including the first. NFR-005 pins this at 3. */
  readonly maxAttempts: number;
  /** Fixed wait between attempts in milliseconds. NFR-005 pins this at 500. */
  readonly backoffMs: number;
}

/**
 * Budget parameters. The total per-request budget (`totalMs`) is consumed
 * starting from the first call into `runWithBudget`. Once it elapses, the
 * derived `AbortSignal` fires and any in-flight attempt is cancelled.
 *
 * The `signal` parameter is the upstream cancellation source (typically the
 * Fastify request's abort signal forwarded through the agent). When it fires,
 * the helper aborts the derived signal so the tool tears down.
 */
export interface BudgetOptions {
  /** Per-request budget in milliseconds. NFR-005 pins LIVE searches at 10_000. */
  readonly totalMs: number;
  /** Upstream cancellation source. The helper composes this with the budget timer. */
  readonly signal: AbortSignal;
  /** Time-source seam for backoff and budget waits. */
  readonly clock: Clock;
}

/**
 * The retry-policy defaults pinned by NFR-005 / OQ-001. Exposed so callers
 * (and tests) can reference the canonical values without re-encoding them.
 */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  backoffMs: 500,
};

/**
 * Per-attempt failure classification. `transient` invites a retry;
 * `terminal` short-circuits the helper. `validation` from a tool maps to
 * `terminal` here because the agent already validated upstream — a
 * tool-level validation failure is a tool bug per
 * `.design/components/tools-layer.md`.
 */
interface FailureClassification {
  readonly retriable: boolean;
  readonly error: ToolErrorContract;
}

const classifyError = (error: ToolErrorContract): FailureClassification => ({
  retriable: error.kind === 'transient',
  error,
});

/**
 * Race two promises and resolve when either completes. The waiter is
 * abort-aware (via the injected clock); the worker is the in-flight attempt.
 * We do NOT throw when the budget wins — instead the caller inspects the
 * derived signal state after the race resolves.
 */
const raceBudgetAgainstAttempt = async <T>(
  attempt: Promise<T>,
  budgetWait: Promise<void>,
): Promise<{ readonly kind: 'attempt'; readonly value: T } | { readonly kind: 'budget' }> => {
  const wrappedAttempt: Promise<{ readonly kind: 'attempt'; readonly value: T }> = attempt.then(
    (value) => ({ kind: 'attempt', value }),
  );
  const wrappedBudget: Promise<{ readonly kind: 'budget' }> = budgetWait.then(() => ({
    kind: 'budget',
  }));
  return Promise.race([wrappedAttempt, wrappedBudget]);
};

/**
 * The shared retry helper. Per the AC pinned in STORY-011:
 *  - returns `{ ok: true, value }` on first success (no further attempts);
 *  - retries on `transient`, up to `policy.maxAttempts` total tries;
 *  - waits `policy.backoffMs` between attempts via `budget.clock`;
 *  - exhausts retries → `{ ok: false, error: { kind: "transient" } }`;
 *  - upstream signal aborts or budget elapses → `{ ok: false, error: { kind: "cancelled" } }`;
 *  - any non-transient error from the attempt short-circuits to its mapped
 *    `kind` (`terminal` or `validation`) without retry.
 *
 * The helper itself NEVER throws across its boundary — every failure path
 * returns a structured `Result<T, AgentErrorContract>` per FR-023 / I-26.
 */
export const runWithBudget = async <T>(
  fn: (signal: AbortSignal) => Promise<Result<T, ToolErrorContract>>,
  policy: RetryPolicy,
  budget: BudgetOptions,
): Promise<Result<T, AgentErrorContract>> => {
  // Compose the upstream signal with the budget timer. The derived signal is
  // the one passed to every attempt — when EITHER source fires, the attempt's
  // tool sees an aborted signal. This is the SOLE legal site (per I-25) for
  // creating a derived signal from a budget timer.
  const controller = new AbortController();
  const onUpstreamAbort = (): void => {
    if (!controller.signal.aborted) controller.abort(budget.signal.reason);
  };
  if (budget.signal.aborted) {
    controller.abort(budget.signal.reason);
  } else {
    budget.signal.addEventListener('abort', onUpstreamAbort, { once: true });
  }

  // The budget timer fires once and is shared across every attempt — it is
  // NOT reset between retries. NFR-005's "10s budget" is per-request, not
  // per-attempt, so a slow upstream that consumes 9.9s on the first try MUST
  // surface as cancelled before the second try starts.
  const budgetWait = budget.clock.wait(budget.totalMs, controller.signal).then(() => {
    if (!controller.signal.aborted) {
      controller.abort(new Error('budget-exhausted'));
    }
  });

  let lastTransient: ToolErrorContract | null = null;

  try {
    for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
      // Cancellation can fire between attempts — short-circuit before the
      // next try if so. This is the same shape as the post-wait check below.
      if (controller.signal.aborted) {
        return cancelledResult(controller.signal.reason);
      }

      const attemptPromise = fn(controller.signal);
      const raced = await raceBudgetAgainstAttempt(attemptPromise, budgetWait);

      if (raced.kind === 'budget') {
        // The budget elapsed (or the upstream signal aborted) before the
        // attempt resolved. Surface as cancelled per NFR-005 / FR-023. The
        // tool's own handler sees the derived signal aborted and tears down
        // — we do NOT await the now-orphaned attempt promise because the
        // tool already received the cancellation; awaiting would tie the
        // helper's resolution to a tool that may never settle.
        return cancelledResult(controller.signal.reason);
      }

      const result = raced.value;
      if (result.ok) {
        return { ok: true, value: result.value };
      }

      const classified = classifyError(result.error);
      if (!classified.retriable) {
        // Non-transient → no retry. Both `terminal` from the tool and
        // `validation` from the tool surface as `terminal` at the AGENT
        // boundary because agent-side validation has already run on entry
        // (so a `validation` from a tool implies the tool's own input
        // contract disagreed with the agent's — that is a tool bug, hence
        // terminal). The `AgentErrorContract.kind` taxonomy intentionally
        // does NOT carry a `validation` value for tool-level errors.
        return {
          ok: false,
          error: {
            kind: 'terminal',
            message: classified.error.message,
            details: classified.error.cause,
          },
        };
      }

      lastTransient = classified.error;

      // Backoff before the next attempt — but only if there IS a next
      // attempt. The wait races against the budget signal so a budget
      // elapse during backoff cancels promptly. After the wait, we re-check
      // the signal state and short-circuit if anything fired.
      if (attempt < policy.maxAttempts) {
        await budget.clock.wait(policy.backoffMs, controller.signal);
        if (controller.signal.aborted) {
          return cancelledResult(controller.signal.reason);
        }
      }
    }

    // Loop exited with `maxAttempts` consumed and the last attempt was
    // transient. Surface as transient per NFR-005 — the API layer will map
    // this to FR-005's `transient_exhausted` (STORY-013).
    return {
      ok: false,
      error: {
        kind: 'transient',
        message: lastTransient?.message ?? 'transient: retries exhausted',
        details: lastTransient?.cause,
      },
    };
  } finally {
    // Clean up the upstream listener so a long-lived upstream signal does
    // not retain a reference to a dead controller. The budget wait is
    // already settled (or about to resolve immediately on abort).
    budget.signal.removeEventListener('abort', onUpstreamAbort);
    if (!controller.signal.aborted) {
      // Ensure the budgetWait timer in the injected clock is released so a
      // long-running test process does not leak handles. We abort with a
      // sentinel reason that no caller observes.
      controller.abort(new Error('run-with-budget: completed'));
    }
  }
};

/**
 * Build a structured `cancelled` agent error from a signal's reason.
 *
 * Per FR-023, the agent's error contract carries a `kind` discriminant; the
 * `details` field preserves the abort reason for downstream forensics
 * (logged, not surfaced to the UI).
 */
const cancelledResult = (reason: unknown): Result<never, AgentErrorContract> => {
  const message = reason instanceof Error ? reason.message : 'cancelled';
  return {
    ok: false,
    error: {
      kind: 'cancelled',
      message,
      details: reason,
    },
  };
};
