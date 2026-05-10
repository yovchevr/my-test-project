/**
 * `@neo-search/agent` — public surface (STORY-011).
 *
 * Per `.design/components/agent.md`, the agent exposes:
 *  - `createAgent({ registry, synthesize, clock })` — the factory the API's
 *    composition root calls at startup;
 *  - the structured `runWithBudget` retry helper, exported so STORY-013's
 *    integration tests can compose against the same defaults.
 *
 * Internal modules:
 *  - `agent-loop.ts` — the five-step orchestration body and the
 *    `Record<SourceFilter, RouteHandler>` lookup;
 *  - `run-with-budget.ts` — the SHARED retry helper (NFR-005 / I-27).
 *
 * Per ADR 0001, this package's only legal downstream is `@neo-search/tools`
 * via the registry. No `packages/data-*` import appears anywhere in this
 * package's source tree — the boundary lint rule encodes the reverse.
 */
export { createAgent } from './agent-loop.js';
export type {
  AgentFn,
  CreateAgentOptions,
  SynthesisFn,
  SynthesisOutput,
  AgentLogger,
  AgentToolInvokedFields,
} from './agent-loop.js';

export { runWithBudget, wallClock, DEFAULT_RETRY_POLICY } from './run-with-budget.js';
export type { Clock, RetryPolicy, BudgetOptions } from './run-with-budget.js';
