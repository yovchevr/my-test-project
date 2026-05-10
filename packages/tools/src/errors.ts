/**
 * Registration-time errors raised by `createRegistry`.
 *
 * STORY-003 distinguishes startup throws (legal — a misconfiguration the
 * caller MUST fix before serving traffic) from per-invocation throws (banned
 * by I-26 in `.design/domain/invariants.md`). `register` MAY throw at
 * startup if a tool name collides; `invoke` MUST never throw, no matter what
 * the handler does.
 */

/**
 * Thrown by `ToolRegistry.register` when a tool's `name` is already
 * registered. Caught at the composition root (`services/agent/src/main.ts`)
 * to surface a startup misconfiguration. Per
 * `.design/components/tools-layer.md`, the registry MUST ship at minimum
 * `web-search` and `data-store`; a duplicate-name collision is therefore a
 * boot-time bug.
 */
export class ToolNotFoundError extends Error {
  /**
   * Tool name the caller asked for. Surfaced in `invoke`'s
   * `validation` error message rather than thrown — `invoke` MUST NOT throw
   * (I-26). This class exists for explicit, typed handling at boundaries
   * that DO want a thrown form (e.g. tests asserting on the constructor
   * shape).
   */
  readonly toolName: string;

  constructor(toolName: string) {
    super(`unknown-tool: ${toolName}`);
    this.name = 'ToolNotFoundError';
    this.toolName = toolName;
  }
}

/**
 * Thrown by `ToolRegistry.register` when a tool with the same `name` is
 * registered twice. This is a startup bug per
 * `.design/components/tools-layer.md` and the story's "Unique names" clause —
 * the composition root MUST surface it before serving traffic.
 */
export class DuplicateToolError extends Error {
  readonly toolName: string;

  constructor(toolName: string) {
    super(`duplicate-tool: ${toolName} is already registered`);
    this.name = 'DuplicateToolError';
    this.toolName = toolName;
  }
}
