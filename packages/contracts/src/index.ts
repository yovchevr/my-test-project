/**
 * `@neo-search/contracts` — single source of truth for the four FR-021 boundary
 * contracts.
 *
 * The four boundary modules are re-exported here so consumers import only from
 * `@neo-search/contracts`. Concrete schemas land in STORY-002.
 */
export * from './ui-api.js';
export * from './api-agent.js';
export * from './agent-tools.js';
export * from './tools/data-store.js';
