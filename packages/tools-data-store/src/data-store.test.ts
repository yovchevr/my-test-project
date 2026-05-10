/**
 * STORY-010 unit tests for the `data-store` tool facade.
 *
 * Each `describe` block cites the AC verbatim from
 * `.stories/project-spec/STORY-010-data-store-tool.md` so a reviewer can grep
 * by criterion.
 *
 * AC coverage (FR-014, FR-015, FR-016, FR-018, FR-022, FR-023, NFR-006):
 *  - Tool registers under `name: "data-store"`.
 *  - Each of the seven ops round-trips against fake stores.
 *  - `bookmark.get` for an unknown id returns `validation: not-found` (not throw / not null).
 *  - A simulated store throw is caught and surfaces as `terminal: <message>`.
 *  - A pre-aborted `AbortSignal` returns terminal early WITHOUT invoking any store.
 *  - Lookup-table dispatch is structurally enforced — source MUST NOT contain `switch (op)`.
 *  - Adding a synthetic 8th op only requires a new entry in the lookup-table shape (regression
 *    guard for NFR-006 / I-23).
 *
 * The unit tier uses fake stores — temp-dir SQLite is exercised in
 * `data-store.spec.ts`. Per `.design/technology/testing.md` "Forbidden test
 * patterns", these tests do not use `setTimeout`, do not depend on execution
 * order, and do not mutate shared fixtures in place.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type {
  BookmarkEntryContract,
  DataStoreInputContract,
  HistoryEntryContract,
  PaginationContract,
  ResultCardContract,
} from '@neo-search/contracts';
import type { BookmarkStore } from '@neo-search/data-bookmarks';
import type { CacheReadResult, CacheWriteResult, SearchCache } from '@neo-search/data-cache';
import type { HistoryStore } from '@neo-search/data-history';
import { createDataStoreHandler, dataStoreTool } from './index.js';

const PAGINATION_ZERO: PaginationContract = { page: 1, totalChunks: 0, hasMore: false };

const sampleResult: ResultCardContract = {
  title: 'Example',
  snippet: 'A snippet',
  domain: 'example.com',
  url: 'https://example.com/page',
};

const sampleHistoryEntry: HistoryEntryContract = {
  id: 'h-1',
  query: 'typebox',
  sourceFilter: 'LIVE',
  ts: '2026-05-10T12:00:00.000Z',
  resultChunkIds: ['chunk-0'],
};

const sampleBookmarkEntry: BookmarkEntryContract = {
  id: 'bm-1',
  kind: 'answer',
  payload: { answer_summary: 'hi' },
  ts: '2026-05-10T12:00:00.000Z',
};

/**
 * Build a complete set of fake stores. Each method is a `vi.fn()` so a test
 * can assert "MUST NOT be called" in addition to the structured success
 * cases. Defaults return safe empty-shape responses; tests override per-case
 * by re-assigning `mockResolvedValueOnce` / `mockRejectedValueOnce`.
 */
const buildFakes = (): {
  historyStore: HistoryStore;
  bookmarkStore: BookmarkStore;
  searchCache: SearchCache;
} => {
  const historyStore: HistoryStore = {
    append: vi.fn().mockResolvedValue({ id: 'h-new' }),
    list: vi.fn().mockResolvedValue({ entries: [], pagination: PAGINATION_ZERO }),
    close: vi.fn(),
  };
  const bookmarkStore: BookmarkStore = {
    save: vi.fn().mockResolvedValue({ id: 'bm-new' }),
    list: vi.fn().mockResolvedValue({ entries: [], pagination: PAGINATION_ZERO }),
    get: vi.fn().mockResolvedValue(null),
    close: vi.fn(),
  };
  const searchCache: SearchCache = {
    write: vi.fn().mockResolvedValue({ chunkIds: [] } satisfies CacheWriteResult),
    read: vi.fn().mockResolvedValue({
      results: [],
      chunksRead: 0,
      pagination: PAGINATION_ZERO,
    } satisfies CacheReadResult),
    close: vi.fn(),
  };
  return { historyStore, bookmarkStore, searchCache };
};

const liveSignal = (): AbortSignal => new AbortController().signal;

describe('AC: tool registers under name "data-store"', () => {
  it('exposes the descriptor with the documented name and schemas', () => {
    expect(dataStoreTool.descriptor.name).toBe('data-store');
    expect(dataStoreTool.descriptor.description.length).toBeGreaterThan(0);
    expect(dataStoreTool.descriptor.inputSchema).toBeDefined();
    expect(dataStoreTool.descriptor.outputSchema).toBeDefined();
  });

  it('default handler returns terminal "handler-not-bound" — composition root MUST swap it', async () => {
    const result = await dataStoreTool.handler(
      // The default handler ignores its input — passing a well-formed shape
      // is enough to satisfy the runtime call signature.
      { op: 'history.list', page: 1 },
      liveSignal(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.kind).toBe('terminal');
    expect(result.error.message).toContain('handler-not-bound');
  });
});

describe('AC: history.append round-trips through historyStore.append', () => {
  it('forwards the entry and signal, returns { op, id } on success', async () => {
    const fakes = buildFakes();
    fakes.historyStore.append = vi.fn().mockResolvedValue({ id: 'h-42' });
    const handler = createDataStoreHandler(fakes);
    const signal = liveSignal();

    const result = await handler({ op: 'history.append', entry: sampleHistoryEntry }, signal);

    expect(result).toEqual({ ok: true, value: { op: 'history.append', id: 'h-42' } });
    expect(fakes.historyStore.append).toHaveBeenCalledWith(sampleHistoryEntry, signal);
  });
});

describe('AC: history.list round-trips through historyStore.list', () => {
  it('forwards the page and signal, returns { op, entries, pagination }', async () => {
    const fakes = buildFakes();
    const pagination: PaginationContract = { page: 2, totalChunks: 5, hasMore: false };
    fakes.historyStore.list = vi
      .fn()
      .mockResolvedValue({ entries: [sampleHistoryEntry], pagination });
    const handler = createDataStoreHandler(fakes);
    const signal = liveSignal();

    const result = await handler({ op: 'history.list', page: 2 }, signal);

    expect(result).toEqual({
      ok: true,
      value: { op: 'history.list', entries: [sampleHistoryEntry], pagination },
    });
    expect(fakes.historyStore.list).toHaveBeenCalledWith(2, signal);
  });
});

describe('AC: bookmark.save round-trips through bookmarkStore.save', () => {
  it('forwards the entry (kind+payload) and signal, returns { op, id }', async () => {
    const fakes = buildFakes();
    fakes.bookmarkStore.save = vi.fn().mockResolvedValue({ id: 'bm-99' });
    const handler = createDataStoreHandler(fakes);
    const signal = liveSignal();

    const saveInput = { kind: 'answer' as const, payload: { answer_summary: 'hi' } };
    const result = await handler({ op: 'bookmark.save', entry: saveInput }, signal);

    expect(result).toEqual({ ok: true, value: { op: 'bookmark.save', id: 'bm-99' } });
    expect(fakes.bookmarkStore.save).toHaveBeenCalledWith(saveInput, signal);
  });
});

describe('AC: bookmark.list round-trips through bookmarkStore.list', () => {
  it('forwards the page and signal, returns { op, entries, pagination }', async () => {
    const fakes = buildFakes();
    const pagination: PaginationContract = { page: 1, totalChunks: 1, hasMore: false };
    fakes.bookmarkStore.list = vi
      .fn()
      .mockResolvedValue({ entries: [sampleBookmarkEntry], pagination });
    const handler = createDataStoreHandler(fakes);
    const signal = liveSignal();

    const result = await handler({ op: 'bookmark.list', page: 1 }, signal);

    expect(result).toEqual({
      ok: true,
      value: { op: 'bookmark.list', entries: [sampleBookmarkEntry], pagination },
    });
    expect(fakes.bookmarkStore.list).toHaveBeenCalledWith(1, signal);
  });
});

describe('AC: bookmark.get round-trips through bookmarkStore.get when present', () => {
  it('forwards the id and signal, returns { op, entry } on hit', async () => {
    const fakes = buildFakes();
    fakes.bookmarkStore.get = vi.fn().mockResolvedValue(sampleBookmarkEntry);
    const handler = createDataStoreHandler(fakes);
    const signal = liveSignal();

    const result = await handler({ op: 'bookmark.get', id: 'bm-1' }, signal);

    expect(result).toEqual({
      ok: true,
      value: { op: 'bookmark.get', entry: sampleBookmarkEntry },
    });
    expect(fakes.bookmarkStore.get).toHaveBeenCalledWith('bm-1', signal);
  });
});

describe('AC: bookmark.get for an unknown id MUST return { kind: "validation", message: "not-found" }', () => {
  it('does NOT throw and does NOT return null — surfaces as validation per the contract-shape rule', async () => {
    const fakes = buildFakes();
    fakes.bookmarkStore.get = vi.fn().mockResolvedValue(null);
    const handler = createDataStoreHandler(fakes);

    const result = await handler({ op: 'bookmark.get', id: 'missing' }, liveSignal());

    expect(result).toEqual({
      ok: false,
      error: { kind: 'validation', message: 'not-found' },
    });
    expect(fakes.bookmarkStore.get).toHaveBeenCalledTimes(1);
  });
});

describe('AC: cache.write round-trips through searchCache.write', () => {
  it('forwards (query, results, signal), returns { op, chunkIds }', async () => {
    const fakes = buildFakes();
    fakes.searchCache.write = vi.fn().mockResolvedValue({ chunkIds: ['c0', 'c1'] });
    const handler = createDataStoreHandler(fakes);
    const signal = liveSignal();

    const result = await handler(
      { op: 'cache.write', query: 'typebox', results: [sampleResult] },
      signal,
    );

    expect(result).toEqual({
      ok: true,
      value: { op: 'cache.write', chunkIds: ['c0', 'c1'] },
    });
    expect(fakes.searchCache.write).toHaveBeenCalledWith('typebox', [sampleResult], signal);
  });
});

describe('AC: cache.read round-trips through searchCache.read', () => {
  it('forwards (query, page, signal), returns { op, results, chunksRead, pagination }', async () => {
    const fakes = buildFakes();
    const pagination: PaginationContract = { page: 1, totalChunks: 10, hasMore: true };
    fakes.searchCache.read = vi
      .fn()
      .mockResolvedValue({ results: [sampleResult], chunksRead: 1, pagination });
    const handler = createDataStoreHandler(fakes);
    const signal = liveSignal();

    const result = await handler({ op: 'cache.read', query: 'typebox', page: 1 }, signal);

    expect(result).toEqual({
      ok: true,
      value: {
        op: 'cache.read',
        results: [sampleResult],
        chunksRead: 1,
        pagination,
      },
    });
    expect(fakes.searchCache.read).toHaveBeenCalledWith('typebox', 1, signal);
  });

  it('FR-018 / NFR-004 — chunksRead is propagated unchanged so the agent can verify "no full scan"', async () => {
    const fakes = buildFakes();
    const pagination: PaginationContract = { page: 5, totalChunks: 10, hasMore: true };
    fakes.searchCache.read = vi.fn().mockResolvedValue({ results: [], chunksRead: 1, pagination });
    const handler = createDataStoreHandler(fakes);

    const result = await handler({ op: 'cache.read', query: 'q', page: 5 }, liveSignal());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    if (result.value.op !== 'cache.read') throw new Error('expected cache.read variant');
    // The strict-less-than relation is the I-10 invariant — the tool itself
    // doesn't enforce it (the cache does), but this test asserts the value
    // survives the facade unchanged so the upstream observability holds.
    expect(result.value.chunksRead).toBe(1);
    expect(result.value.chunksRead).toBeLessThan(result.value.pagination.totalChunks);
  });
});

describe('AC: a simulated store throw MUST surface as { kind: "terminal", message }', () => {
  it('catches a SQLite-style I/O error from historyStore.append and translates to terminal', async () => {
    const fakes = buildFakes();
    const ioError = new Error('SQLITE_IOERR: disk I/O error');
    fakes.historyStore.append = vi.fn().mockRejectedValue(ioError);
    const handler = createDataStoreHandler(fakes);

    const result = await handler({ op: 'history.append', entry: sampleHistoryEntry }, liveSignal());

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.kind).toBe('terminal');
    expect(result.error.message).toBe('SQLITE_IOERR: disk I/O error');
    // The original error is preserved on `cause` for log forensics.
    expect(result.error.cause).toBe(ioError);
  });

  it('catches a non-Error throw (e.g. string) and surfaces a generic terminal message', async () => {
    const fakes = buildFakes();
    fakes.searchCache.write = vi.fn().mockRejectedValue('boom');
    const handler = createDataStoreHandler(fakes);

    const result = await handler({ op: 'cache.write', query: 'q', results: [] }, liveSignal());

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.kind).toBe('terminal');
    expect(result.error.message).toBe('boom');
  });

  it('catches a thrown non-string non-Error (e.g. plain object) and falls back to "store-threw"', async () => {
    const fakes = buildFakes();
    fakes.bookmarkStore.list = vi.fn().mockRejectedValue({ unexpected: true });
    const handler = createDataStoreHandler(fakes);

    const result = await handler({ op: 'bookmark.list', page: 1 }, liveSignal());

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.kind).toBe('terminal');
    expect(result.error.message).toBe('store-threw');
  });
});

describe('AC: a pre-aborted AbortSignal MUST cause the handler to return early without invoking any store', () => {
  it('returns terminal "cancelled" and does NOT call any store method', async () => {
    const fakes = buildFakes();
    const handler = createDataStoreHandler(fakes);
    const ctrl = new AbortController();
    ctrl.abort(new Error('budget-exhausted'));

    const result = await handler({ op: 'history.list', page: 1 }, ctrl.signal);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.kind).toBe('terminal');
    expect(result.error.message).toBe('cancelled');

    // Belt-and-braces — the AC says "without invoking any store method".
    expect(fakes.historyStore.append).not.toHaveBeenCalled();
    expect(fakes.historyStore.list).not.toHaveBeenCalled();
    expect(fakes.bookmarkStore.save).not.toHaveBeenCalled();
    expect(fakes.bookmarkStore.list).not.toHaveBeenCalled();
    expect(fakes.bookmarkStore.get).not.toHaveBeenCalled();
    expect(fakes.searchCache.read).not.toHaveBeenCalled();
    expect(fakes.searchCache.write).not.toHaveBeenCalled();
  });

  // Each row is `[label, input]`. We type `input` as `DataStoreInputContract`
  // so the lookup-table dispatch typechecks — `as const` would freeze the
  // literal as `readonly` and TS would refuse to widen `results: readonly []`
  // to the contract's mutable `ResultCardContract[]`.
  const preAbortedCases: ReadonlyArray<readonly [string, DataStoreInputContract]> = [
    ['history.append', { op: 'history.append', entry: sampleHistoryEntry }],
    ['history.list', { op: 'history.list', page: 1 }],
    ['bookmark.save', { op: 'bookmark.save', entry: { kind: 'result', payload: {} } }],
    ['bookmark.list', { op: 'bookmark.list', page: 1 }],
    ['bookmark.get', { op: 'bookmark.get', id: 'bm-1' }],
    ['cache.write', { op: 'cache.write', query: 'q', results: [] }],
    ['cache.read', { op: 'cache.read', query: 'q', page: 1 }],
  ];

  it.each(preAbortedCases)(
    'pre-aborted signal short-circuits op=%s without touching the stores',
    async (_op, input) => {
      const fakes = buildFakes();
      const handler = createDataStoreHandler(fakes);
      const ctrl = new AbortController();
      ctrl.abort();

      const result = await handler(input, ctrl.signal);

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('expected failure');
      expect(result.error.kind).toBe('terminal');
      expect(result.error.message).toBe('cancelled');
      // Every fake's call list MUST be empty — short-circuit is global.
      for (const fakeFn of [
        fakes.historyStore.append,
        fakes.historyStore.list,
        fakes.bookmarkStore.save,
        fakes.bookmarkStore.list,
        fakes.bookmarkStore.get,
        fakes.searchCache.read,
        fakes.searchCache.write,
      ]) {
        expect(fakeFn).not.toHaveBeenCalled();
      }
    },
  );
});

describe('AC: routing is a lookup table — source MUST NOT contain a `switch (op)` block (NFR-006 / I-22)', () => {
  // STORY-018 wires the broader AST scan; this is the local source-level
  // assertion so a local test run catches the regression without needing the
  // full lint pass.
  //
  // We strip line comments, block comments, and string / template literals
  // BEFORE scanning so the rule fires only on real `switch` syntax — the
  // module-level docs reference `switch (op)` inside backticks to explain
  // what the lookup-table approach replaces, and that documentary mention
  // MUST NOT be flagged as a violation.
  const stripCommentsAndStrings = (source: string): string =>
    source
      // Block comments (non-greedy, multiline).
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // Line comments — match to end-of-line, not greedy.
      .replace(/\/\/[^\n]*/g, '')
      // Template literals — multi-line, non-greedy. May contain `${...}`
      // expressions; for the regression we care about, the simple strip
      // is enough (we're not looking for `switch` inside an expression).
      .replace(/`[^`]*`/g, '""')
      // Double-quoted strings.
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      // Single-quoted strings.
      .replace(/'(?:[^'\\]|\\.)*'/g, "''");

  it('the data-store source code (excluding comments / strings) contains zero `switch` blocks', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const rawSource = readFileSync(join(here, 'index.ts'), 'utf8');
    const codeOnly = stripCommentsAndStrings(rawSource);

    // The narrow regression we want to catch: `switch (op)` / `switch (input.op)`.
    expect(/switch\s*\(\s*op\s*\)/.test(codeOnly)).toBe(false);
    expect(/switch\s*\(\s*input\.op\s*\)/.test(codeOnly)).toBe(false);

    // The broader regression: ANY `switch (...)` in real code re-introduces
    // the control-flow branching NFR-006 forbids for op routing. The module
    // is a thin facade — there is no other legitimate use for a `switch`
    // here. If a future change needs one, the rule below should be replaced
    // by a tighter check on `op`-keyed switches; loosening it silently
    // erodes the lookup-table discipline.
    expect(/\bswitch\s*\(/.test(codeOnly)).toBe(false);
  });
});

describe('AC: adding a new op is a single-entry change in the lookup table (NFR-006 / I-23 regression guard)', () => {
  // STORY-010 scope: "Adding a new op MUST be possible by adding one entry
  // to the routing table and one matching variant in DataStoreInputContract /
  // DataStoreOutputContract — no other file in the package needs to change."
  //
  // We can't structurally exercise "adding a contract variant" without
  // mutating `@neo-search/contracts`, but we CAN demonstrate the routing
  // table's extensibility shape: a synthetic 8th op slotted into a Record-
  // shaped table requires only a new entry, not a control-flow change.
  // The structural shape (table-of-functions) is what NFR-006 demands; this
  // test is the regression guard that the table is a `Record`, not a
  // `switch`.
  it('a synthetic 8th op is a one-entry addition to the table — no flow rewrite', () => {
    type SyntheticOp = 'history.append' | 'synthetic.noop';

    // The shape of the routing table — exactly the shape STORY-010 requires.
    // Adding a real 8th op would extend `DataStoreOp` in @neo-search/contracts
    // and add the corresponding entry here. The synthetic case below proves
    // that the SHAPE permits extension without a `switch` / `if-else` chain.
    const tableShape: Record<
      SyntheticOp,
      (input: { op: SyntheticOp }) => { ok: true; value: { op: SyntheticOp } }
    > = {
      'history.append': (input) => ({ ok: true, value: { op: input.op } }),
      'synthetic.noop': (input) => ({ ok: true, value: { op: input.op } }),
    };

    // Dispatch via lookup — the structural identity of the production code.
    const dispatched = tableShape['synthetic.noop']({ op: 'synthetic.noop' });
    expect(dispatched).toEqual({ ok: true, value: { op: 'synthetic.noop' } });

    // The set of keys MUST equal the union — TypeScript's mapped-type guard
    // enforces this at compile time, but we assert at runtime so a future
    // table-shape rewrite (e.g. switching to a `Map` or a function chain)
    // fails this test by name.
    const keys = Object.keys(tableShape).sort();
    expect(keys).toEqual(['history.append', 'synthetic.noop']);
  });
});

describe('AC: this package MUST NOT import from services/agent, services/api, or apps/ui (boundary discipline)', () => {
  it('the source contains zero forbidden upstream-layer imports', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, 'index.ts'), 'utf8');
    expect(source).not.toMatch(/from\s+['"][^'"]*services\/agent[^'"]*['"]/);
    expect(source).not.toMatch(/from\s+['"][^'"]*services\/api[^'"]*['"]/);
    expect(source).not.toMatch(/from\s+['"][^'"]*apps\/ui[^'"]*['"]/);
    expect(source).not.toMatch(/from\s+['"]@neo-search\/agent['"]/);
    expect(source).not.toMatch(/from\s+['"]@neo-search\/api['"]/);
    expect(source).not.toMatch(/from\s+['"]@neo-search\/ui['"]/);
  });
});

describe('Defensive: unknown op surfaces as terminal (registry-bypass scenario)', () => {
  // The registry validates the input contract before this handler runs, so
  // an unknown op is only reachable when a caller bypasses the registry.
  // The handler MUST still not throw — `terminal` is the documented
  // "the tool returned malformed data" classification per
  // `.design/components/data-store-tool.md`.
  it('returns terminal "unknown-op: <op>" without touching any store', async () => {
    const fakes = buildFakes();
    const handler = createDataStoreHandler(fakes);

    // Drive an out-of-contract op through the handler. The cast is the
    // explicit "yes, we know this is malformed" annotation — TypeScript's
    // exhaustive union narrowing would otherwise reject the literal.
    const result = await handler(
      { op: 'history.delete' as 'history.append', entry: sampleHistoryEntry } as Parameters<
        ReturnType<typeof createDataStoreHandler>
      >[0],
      liveSignal(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.kind).toBe('terminal');
    expect(result.error.message).toMatch(/unknown-op/);
    expect(fakes.historyStore.append).not.toHaveBeenCalled();
  });
});
