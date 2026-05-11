/**
 * API client for the UI layer.
 *
 * Per `.design/components/ui-shell.md`, the UI MUST NOT import agent or
 * data-layer code directly. This thin wrapper over `fetch` returns typed
 * `Result<T, E>` shapes and attaches a fresh UUID `clientRequestId` per write
 * call (per `search-api.md`'s 5s-window dedup requirement).
 */
import type {
  SearchRequestContract,
  UiApiAnswerContract,
  BookmarkSaveRequestContract,
  BookmarkSaveResponseContract,
} from '@neo-search/contracts';

/**
 * Structured error returned when an API call fails. The `kind` field matches
 * the error-status mapping table from `search-api.md`.
 */
export type ApiError = {
  kind: 'validation' | 'terminal' | 'transient_exhausted' | 'cancelled' | 'network' | 'internal';
  message: string;
};

/**
 * Result type for API calls. Either `{ ok: true, value }` or
 * `{ ok: false, error }`.
 */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

/**
 * Generate a fresh UUID v4 for `clientRequestId`. Uses the browser's
 * `crypto.randomUUID()` API (available in all modern browsers per
 * `tech-stack.md`'s Node 22 target).
 */
function generateClientRequestId(): string {
  return crypto.randomUUID();
}

/**
 * POST /api/search with a fresh `clientRequestId` UUID.
 *
 * Per `search-api.md`, the server uses `clientRequestId` to deduplicate
 * repeated writes within a 5s window. React Query's mutation handles
 * client-side overlapping-call rejection, but the server-side dedup is still
 * required for the retry case.
 *
 * @param request - The search request payload (query, sourceFilter, page).
 * @param signal - Optional AbortSignal for cancellation.
 * @returns A `Result` wrapping the `UiApiAnswerContract` or an `ApiError`.
 */
export async function postSearch(
  request: Omit<SearchRequestContract, 'clientRequestId'>,
  signal?: AbortSignal,
): Promise<Result<UiApiAnswerContract, ApiError>> {
  try {
    const payload: SearchRequestContract = {
      ...request,
      clientRequestId: generateClientRequestId(),
    };

    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) {
      // Map HTTP status codes to error kinds per `search-api.md`'s table.
      const body = await response.json().catch(() => ({}));
      const kind = mapStatusToKind(response.status, body);
      const message = body?.error?.message ?? `HTTP ${response.status}`;
      return { ok: false, error: { kind, message } };
    }

    const body = await response.json();

    // The API returns `{ ok: true, value }` or `{ ok: false, error }` per
    // `foundation/conventions.md`. Extract the value or error accordingly.
    if (body.ok === false) {
      return {
        ok: false,
        error: {
          kind: body.error?.kind ?? 'internal',
          message: body.error?.message ?? 'Unknown error',
        },
      };
    }

    return { ok: true, value: body.value };
  } catch (err) {
    // Network error (fetch threw) or cancellation via AbortSignal.
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, error: { kind: 'cancelled', message: 'Request cancelled' } };
    }
    return { ok: false, error: { kind: 'network', message: 'Network error' } };
  }
}

/**
 * POST /api/bookmarks with a fresh `clientRequestId` UUID.
 *
 * @param request - The bookmark save payload (kind, payload).
 * @param signal - Optional AbortSignal for cancellation.
 * @returns A `Result` wrapping the `BookmarkSaveResponseContract` or an
 *   `ApiError`.
 */
export async function postBookmark(
  request: Omit<BookmarkSaveRequestContract, 'clientRequestId'>,
  signal?: AbortSignal,
): Promise<Result<BookmarkSaveResponseContract, ApiError>> {
  try {
    const payload: BookmarkSaveRequestContract = {
      ...request,
      clientRequestId: generateClientRequestId(),
    };

    const response = await fetch('/api/bookmarks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const kind = mapStatusToKind(response.status, body);
      const message = body?.error?.message ?? `HTTP ${response.status}`;
      return { ok: false, error: { kind, message } };
    }

    const body = await response.json();

    if (body.ok === false) {
      return {
        ok: false,
        error: {
          kind: body.error?.kind ?? 'internal',
          message: body.error?.message ?? 'Unknown error',
        },
      };
    }

    return { ok: true, value: body.value };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, error: { kind: 'cancelled', message: 'Request cancelled' } };
    }
    return { ok: false, error: { kind: 'network', message: 'Network error' } };
  }
}

/**
 * Map HTTP status codes to error kinds per `search-api.md`'s error-surface
 * table.
 */
function mapStatusToKind(status: number, body: { error?: { kind?: string } }): ApiError['kind'] {
  // If the body carries a structured `error.kind`, trust it.
  if (body?.error?.kind) {
    const kind = body.error.kind;
    if (
      kind === 'validation' ||
      kind === 'terminal' ||
      kind === 'transient_exhausted' ||
      kind === 'cancelled'
    ) {
      return kind;
    }
  }

  // Otherwise fall back to status-code mapping.
  if (status === 400) return 'validation';
  if (status === 502) return 'terminal';
  if (status === 503) return 'transient_exhausted';
  if (status === 504) return 'cancelled';
  return 'internal';
}
