/**
 * Test-only format-registry shim.
 *
 * TypeBox's `Value.Check` does not enforce the `format` keyword by default —
 * formats are metadata until a runtime validator is registered through
 * `FormatRegistry.Set`. The contract tests below validate `format: "uri"`
 * and `format: "uuid"` constraints (FR-009 acceptance criterion), so we
 * register lightweight validators here so a malformed payload is actually
 * rejected.
 *
 * The production wire validator (Fastify, STORY-013) registers Ajv's full
 * format suite via `ajv-formats`. These shims are deliberately conservative
 * and only used by the contract test suite.
 */
import { FormatRegistry } from '@sinclair/typebox';

const URI_PATTERN = /^[a-z][a-z0-9+\-.]*:\/\/[^\s/$.?#].[^\s]*$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let registered = false;

export const registerFormats = (): void => {
  if (registered) return;
  registered = true;
  FormatRegistry.Set('uri', (value) => URI_PATTERN.test(value));
  FormatRegistry.Set('uuid', (value) => UUID_PATTERN.test(value));
  FormatRegistry.Set('date-time', (value) => !Number.isNaN(Date.parse(value)));
};
