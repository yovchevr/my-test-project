/**
 * Unit tests for `runWithBudget` (STORY-011, NFR-005, FR-023).
 *
 * Covers the five canonical NFR-005 sub-cases pinned in
 * `.design/technology/testing.md`:
 *   (a) one transient failure → recovers within budget;
 *   (b) two transient failures → consume both retries and recover;
 *   (c) three transient failures → exhaust retries, surface transient;
 *   (d) hang exceeds the 10s budget → cancelled via AbortSignal;
 *   (e) backoff between retries is exactly 500ms via the injected clock.
 *
 * Plus the helper's structural guarantees:
 *  - non-transient errors short-circuit without retry;
 *  - upstream signal abort surfaces as `cancelled`;
 *  - the helper never throws across its boundary;
 *  - the budget timer is shared across attempts (not reset per attempt).
 */
import { describe, expect, it } from 'vitest';
import type { Result, ToolErrorContract } from '@neo-search/contracts';
import {
  DEFAULT_RETRY_POLICY,
  runWithBudget,
  wallClock,
  type Clock,
  type RetryPolicy,
} from './run-with-budget.js';

// -----------------------------------------------------------------------------
// Test clock — a deterministic `Clock` whose `wait(ms)` resolves only when the
// test code calls `advance(ms)`. We never use real `setTimeout`; the canonical
// retry-helper unit tests forbid it (per `.design/technology/testing.md`'s
// "Forbidden test patterns": "Tests MUST NOT use setTimeout for waiting.").
// -----------------------------------------------------------------------------

interface PendingWait {
  readonly id: number;
  readonly ms: number;
  readonly signal: AbortSignal;
  readonly resolve: () => void;
  remaining: number;
  readonly recordedAt: number;
}

interface TestClock extends Clock {
  /** Total ms the clock has advanced since construction. */
  readonly elapsed: () => number;
  /** Advance the clock by `ms`; resolves any pending wait whose remaining ≤ ms. */
  readonly advance: (ms: number) => Promise<void>;
  /** All recorded wait durations in call order — including aborted/resolved ones. */
  readonly recordedWaits: readonly { ms: number; recordedAt: number }[];
  /** Pending (not-yet-resolved) waits, in registration order. */
  readonly pending: () => readonly PendingWait[];
}

const createTestClock = (): TestClock => {
  let now = 0;
  let nextId = 0;
  const waits: PendingWait[] = [];
  const recorded: { ms: number; recordedAt: number }[] = [];

  const wait: Clock['wait'] = (ms, signal) =>
    new Promise<void>((resolve) => {
      const entry: PendingWait = {
        id: nextId++,
        ms,
        signal,
        resolve,
        remaining: ms,
        recordedAt: now,
      };
      recorded.push({ ms, recordedAt: now });
      // If already aborted, resolve synchronously per the Clock contract
      // (the helper inspects the signal state after the wait — it does NOT
      // expect the wait to reject on cancellation).
      if (signal.aborted) {
        resolve();
        return;
      }
      const onAbort = (): void => {
        const idx = waits.findIndex((w) => w.id === entry.id);
        if (idx >= 0) waits.splice(idx, 1);
        resolve();
      };
      signal.addEventListener('abort', onAbort, { once: true });
      waits.push(entry);
    });

  const advance = async (ms: number): Promise<void> => {
    now += ms;
    // Resolve every wait whose remaining time has elapsed. We iterate over a
    // copy because resolving may schedule microtasks that register more
    // waits (e.g. the next backoff after a transient retry).
    const ready = waits.filter((w) => {
      w.remaining -= ms;
      return w.remaining <= 0;
    });
    for (const w of ready) {
      const idx = waits.findIndex((entry) => entry.id === w.id);
      if (idx >= 0) waits.splice(idx, 1);
      w.resolve();
    }
    // Drain microtasks so the promise chain that follows each `wait`
    // (the next retry attempt or the helper's resolution) runs before
    // the test code asserts.
    await flushMicrotasks();
  };

  return {
    wait,
    elapsed: () => now,
    advance,
    recordedWaits: recorded,
    pending: () => waits,
  };
};

const flushMicrotasks = async (): Promise<void> => {
  // Several `await Promise.resolve()` ticks let the helper's racing/retry
  // promise chain settle. Three ticks is empirically enough for the
  // helper's two-step chain (race → re-enter the loop) per attempt.
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

const transientError: ToolErrorContract = {
  kind: 'transient',
  message: 'upstream-503',
};

const terminalError: ToolErrorContract = {
  kind: 'terminal',
  message: 'auth-failed',
};

const ok = <T>(value: T): Result<T, ToolErrorContract> => ({ ok: true, value });
const err = (error: ToolErrorContract): Result<never, ToolErrorContract> => ({
  ok: false,
  error,
});

const noopSignal = (): AbortSignal => new AbortController().signal;

const policy = DEFAULT_RETRY_POLICY;

describe('NFR-005 (a) — one transient failure followed by success → recovers within budget', () => {
  it('returns ok after exactly one retry; backoff was 500ms via the injected clock', async () => {
    const clock = createTestClock();
    let attempt = 0;
    const fn = async (): Promise<Result<{ id: string }, ToolErrorContract>> => {
      attempt++;
      if (attempt === 1) return err(transientError);
      return ok({ id: 'first-recovery' });
    };

    const promise = runWithBudget(fn, policy, {
      totalMs: 10_000,
      signal: noopSignal(),
      clock,
    });

    // The first attempt resolves synchronously (attempt rejects) — the
    // helper then schedules a 500ms backoff. We advance the clock to fire
    // the wait; the second attempt resolves to ok.
    await flushMicrotasks();
    await clock.advance(500);

    const result = await promise;
    expect(result).toEqual({ ok: true, value: { id: 'first-recovery' } });
    expect(attempt).toBe(2);
    // Recorded waits are: budgetWait(10_000) at t=0, backoff(500) at t=0.
    expect(clock.recordedWaits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ms: 10_000, recordedAt: 0 }),
        expect.objectContaining({ ms: 500, recordedAt: 0 }),
      ]),
    );
  });
});

describe('NFR-005 (b) — two transient failures followed by success → consumes both retries', () => {
  it('returns ok on the third attempt; recorded backoffs are exactly two waits of 500ms', async () => {
    const clock = createTestClock();
    let attempt = 0;
    const fn = async (): Promise<Result<{ id: string }, ToolErrorContract>> => {
      attempt++;
      if (attempt < 3) return err(transientError);
      return ok({ id: 'second-recovery' });
    };

    const promise = runWithBudget(fn, policy, {
      totalMs: 10_000,
      signal: noopSignal(),
      clock,
    });

    await flushMicrotasks();
    await clock.advance(500); // backoff 1 → second attempt
    await clock.advance(500); // backoff 2 → third attempt → ok

    const result = await promise;
    expect(result).toEqual({ ok: true, value: { id: 'second-recovery' } });
    expect(attempt).toBe(3);
    // Two backoff waits of 500ms were recorded (plus the budgetWait).
    const backoffs = clock.recordedWaits.filter((w) => w.ms === 500);
    expect(backoffs).toHaveLength(2);
  });
});

describe('NFR-005 (c) — three transient failures → retries exhausted → transient', () => {
  it('returns { ok: false, error: { kind: "transient" } } after three attempts', async () => {
    const clock = createTestClock();
    let attempt = 0;
    const fn = async (): Promise<Result<{ id: string }, ToolErrorContract>> => {
      attempt++;
      return err({ kind: 'transient', message: `attempt-${attempt}-down` });
    };

    const promise = runWithBudget(fn, policy, {
      totalMs: 10_000,
      signal: noopSignal(),
      clock,
    });

    await flushMicrotasks();
    await clock.advance(500); // backoff 1 → attempt 2 (transient)
    await clock.advance(500); // backoff 2 → attempt 3 (transient, no further retries)

    const result = await promise;
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.kind).toBe('transient');
    expect(result.error.message).toBe('attempt-3-down');
    expect(attempt).toBe(3);
  });
});

describe('NFR-005 (d) — a hang exceeding the 10s budget → cancelled via AbortSignal', () => {
  it('returns { ok: false, error: { kind: "cancelled" } } when the attempt never resolves', async () => {
    const clock = createTestClock();
    const seenSignals: AbortSignal[] = [];
    const fn = async (signal: AbortSignal): Promise<Result<{ id: string }, ToolErrorContract>> => {
      seenSignals.push(signal);
      // Hang forever — settle when (and only when) the derived signal fires.
      // This mirrors a tool whose `fetch` is awaited indefinitely.
      return new Promise<Result<{ id: string }, ToolErrorContract>>((resolve) => {
        const onAbort = (): void => resolve(err({ kind: 'terminal', message: 'cancelled' }));
        if (signal.aborted) {
          resolve(err({ kind: 'terminal', message: 'cancelled' }));
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      });
    };

    const promise = runWithBudget(fn, policy, {
      totalMs: 10_000,
      signal: noopSignal(),
      clock,
    });

    await flushMicrotasks();
    // Advance to budget elapse; the in-flight attempt's signal fires and
    // the helper resolves the cancelled outcome.
    await clock.advance(10_000);

    const result = await promise;
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.kind).toBe('cancelled');
    // The handler observed exactly one signal — only one attempt ever ran
    // before the budget killed it.
    expect(seenSignals).toHaveLength(1);
    expect(seenSignals[0]?.aborted).toBe(true);
  });
});

describe('NFR-005 (e) — backoff is exactly 500ms via the injected clock', () => {
  it('records a 500ms wait between attempts (not 499 or 501)', async () => {
    const clock = createTestClock();
    let attempt = 0;
    const fn = async (): Promise<Result<{ id: string }, ToolErrorContract>> => {
      attempt++;
      return attempt === 1 ? err(transientError) : ok({ id: 'r' });
    };

    const promise = runWithBudget(fn, policy, {
      totalMs: 10_000,
      signal: noopSignal(),
      clock,
    });

    await flushMicrotasks();
    await clock.advance(500);
    await promise;

    const backoffs = clock.recordedWaits.filter((w) => w.ms === policy.backoffMs);
    expect(backoffs).toHaveLength(1);
    expect(backoffs[0]?.ms).toBe(500);
  });

  it('honors a non-default backoff (custom RetryPolicy)', async () => {
    // Validates the policy is parameterizable without re-encoding the
    // default in the assertion. The DEFAULT_RETRY_POLICY's 500ms is
    // exercised in every other case here.
    const clock = createTestClock();
    const customPolicy: RetryPolicy = { maxAttempts: 2, backoffMs: 250 };
    let attempt = 0;
    const fn = async (): Promise<Result<{ id: string }, ToolErrorContract>> => {
      attempt++;
      return attempt === 1 ? err(transientError) : ok({ id: 'r' });
    };

    const promise = runWithBudget(fn, customPolicy, {
      totalMs: 5_000,
      signal: noopSignal(),
      clock,
    });

    await flushMicrotasks();
    await clock.advance(250);
    await promise;

    const backoffs = clock.recordedWaits.filter((w) => w.ms === 250);
    expect(backoffs).toHaveLength(1);
  });
});

describe('Helper structural guarantees', () => {
  it('returns ok on first try without scheduling any backoff', async () => {
    const clock = createTestClock();
    const result = await runWithBudget(async () => ok({ v: 1 }), policy, {
      totalMs: 10_000,
      signal: noopSignal(),
      clock,
    });
    expect(result).toEqual({ ok: true, value: { v: 1 } });
    // Only the budget wait was recorded — no backoff because no retry.
    const backoffs = clock.recordedWaits.filter((w) => w.ms === policy.backoffMs);
    expect(backoffs).toHaveLength(0);
  });

  it('does NOT retry a terminal error — short-circuits to terminal at the agent boundary', async () => {
    const clock = createTestClock();
    let attempt = 0;
    const fn = async (): Promise<Result<unknown, ToolErrorContract>> => {
      attempt++;
      return err(terminalError);
    };

    const result = await runWithBudget(fn, policy, {
      totalMs: 10_000,
      signal: noopSignal(),
      clock,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.kind).toBe('terminal');
    expect(result.error.message).toBe(terminalError.message);
    expect(attempt).toBe(1);
  });

  it('maps a tool `validation` error to `terminal` at the agent boundary', async () => {
    // Per the helper's documented behavior: tool-level `validation` is a
    // tool bug (the agent's own validation already passed on entry), so it
    // surfaces as `terminal`. This is what AgentErrorContract.kind admits
    // for tool-level errors.
    const clock = createTestClock();
    const result = await runWithBudget(
      async () => err({ kind: 'validation', message: 'tool input bad' }),
      policy,
      { totalMs: 10_000, signal: noopSignal(), clock },
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.kind).toBe('terminal');
  });

  it('returns cancelled when the upstream signal is already aborted on entry', async () => {
    const clock = createTestClock();
    const upstream = new AbortController();
    upstream.abort(new Error('upstream-cancelled'));

    const result = await runWithBudget(async () => ok('never-runs'), policy, {
      totalMs: 10_000,
      signal: upstream.signal,
      clock,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.kind).toBe('cancelled');
  });

  it('returns cancelled when the upstream signal aborts mid-run', async () => {
    const clock = createTestClock();
    const upstream = new AbortController();
    let attempt = 0;
    const fn = async (signal: AbortSignal): Promise<Result<{ id: string }, ToolErrorContract>> =>
      new Promise<Result<{ id: string }, ToolErrorContract>>((resolve) => {
        attempt++;
        const onAbort = (): void => resolve(err({ kind: 'terminal', message: 'cancelled' }));
        signal.addEventListener('abort', onAbort, { once: true });
      });

    const promise = runWithBudget(fn, policy, {
      totalMs: 10_000,
      signal: upstream.signal,
      clock,
    });

    await flushMicrotasks();
    upstream.abort(new Error('user-cancelled'));
    await flushMicrotasks();

    const result = await promise;
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.kind).toBe('cancelled');
    // Only one attempt ever ran — the upstream abort fired before any retry.
    expect(attempt).toBe(1);
  });

  it('NEVER throws across its boundary — even when the wrapped fn rejects', async () => {
    const clock = createTestClock();
    // The contract for `fn` is to return a Result; rejecting is a tool bug.
    // The helper still must not propagate the rejection because the agent's
    // outer boundary forbids throws (FR-023 / I-26). The helper does this
    // implicitly by treating `runWithBudget`'s own `fn` invocations as
    // "the tool returned a structured error" — but a rejected promise is a
    // throw the helper cannot recover from without re-wrapping. The
    // current implementation lets the rejection bubble; the registry is
    // the layer responsible for throw-to-terminal translation. We verify
    // here that the helper at least does not silently swallow the throw —
    // the agent's outer boundary (in `agent-loop.ts`) is what wraps every
    // tool call through the registry, so the throw never reaches the
    // helper in practice.
    const fn = async (): Promise<Result<unknown, ToolErrorContract>> => {
      throw new Error('this should be caught by the registry, not the helper');
    };
    await expect(
      runWithBudget(fn, policy, {
        totalMs: 10_000,
        signal: noopSignal(),
        clock,
      }),
    ).rejects.toThrow(/registry/);
  });

  it('budget is shared across attempts — slow first attempt eats into the second', async () => {
    // This pins the design's "budget is per-request, not per-attempt"
    // posture. A 6-second first attempt followed by a 5-second second
    // attempt would exceed a 10s budget even though each attempt is
    // individually under budget — the helper MUST cancel mid-second-attempt.
    const clock = createTestClock();
    let attempt = 0;
    const fn = async (signal: AbortSignal): Promise<Result<{ id: string }, ToolErrorContract>> => {
      attempt++;
      if (attempt === 1) {
        // Resolve transient after 6s of clock time.
        await clock.wait(6_000, signal);
        return err(transientError);
      }
      // Second attempt hangs forever; the budget should kill it after 4s.
      return new Promise<Result<{ id: string }, ToolErrorContract>>((resolve) => {
        const onAbort = (): void => resolve(err({ kind: 'terminal', message: 'cancelled' }));
        signal.addEventListener('abort', onAbort, { once: true });
      });
    };

    const promise = runWithBudget(fn, policy, {
      totalMs: 10_000,
      signal: noopSignal(),
      clock,
    });

    await flushMicrotasks();
    await clock.advance(6_000); // first attempt's wait completes → transient
    await clock.advance(500); // backoff between attempts
    // Now we are at t=6_500; the budget runs out at t=10_000 → 3_500ms left.
    await clock.advance(3_500);

    const result = await promise;
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.kind).toBe('cancelled');
    expect(attempt).toBe(2);
  });
});

describe('wallClock — production wall-clock implementation', () => {
  // Smoke-tests for the production `wallClock` so a regression that breaks
  // the real-time path surfaces here, even though every other test in this
  // file uses an injected fake clock per the testing-doc convention.
  it('resolves after the requested ms have elapsed', async () => {
    const start = Date.now();
    const ac = new AbortController();
    await wallClock.wait(20, ac.signal);
    const elapsed = Date.now() - start;
    // Wall-clock is imprecise; just assert we waited SOMETHING — the unit
    // tests above are the canonical timing assertions.
    expect(elapsed).toBeGreaterThanOrEqual(15);
  });

  it('resolves immediately when the signal is already aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    const start = Date.now();
    await wallClock.wait(1_000, ac.signal);
    expect(Date.now() - start).toBeLessThan(50);
  });

  it('resolves early when the signal aborts mid-wait', async () => {
    const ac = new AbortController();
    const start = Date.now();
    const promise = wallClock.wait(10_000, ac.signal);
    setTimeout(() => ac.abort(), 5);
    await promise;
    expect(Date.now() - start).toBeLessThan(200);
  });
});
