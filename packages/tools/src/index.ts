/**
 * `@neo-search/tools` — the MCP-style tool registry that is the agent's
 * single seam to the rest of the world (FR-022, ADR 0001).
 *
 * Public surface (per STORY-003):
 *  - `defineTool(...)` — typed registration helper for tool authors.
 *  - `createRegistry(...)` — factory for an empty `ToolRegistry`.
 *  - `ToolRegistry` — the registry interface the agent depends on.
 *  - `ToolNotFoundError`, `DuplicateToolError` — typed registration errors.
 *  - `Logger`, `defaultLogger`, `silentLogger` — the structured-log seam.
 *
 * Per `.design/foundation/conventions.md`, every name re-exported from this
 * file carries a TSDoc block on its declaration explaining inputs, outputs,
 * and failure modes. See the source files for those docs.
 *
 * The registry contract (`ToolDescriptorContract`, `ToolErrorContract`,
 * `Result<T, E>`, `ToolHandler<I, O>`) lives in `@neo-search/contracts` per
 * I-34 and is NOT re-declared here.
 */
export { defineTool } from './define-tool.js';
export type { RegisteredTool, RegisteredToolHandler, ToolDescriptor } from './define-tool.js';

export { createRegistry } from './registry.js';
export type { ToolRegistry } from './registry.js';

export { DuplicateToolError, ToolNotFoundError } from './errors.js';

export { defaultLogger, silentLogger } from './logger.js';
export type { LogLevel, Logger, ToolsInvokedLogFields } from './logger.js';
