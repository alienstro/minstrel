import type { ApiErrorBody, ErrorCode } from '@minstrel/shared';

const FALLBACK_MESSAGE = 'Something went wrong. Try again.';

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

// The API is on the same origin (spec §2.2), so the session cookie goes with each call.
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json');
  headers.set('accept', 'application/json');

  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  if (response.ok) {
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
  throw await toError(response);
}

async function toError(response: Response): Promise<ApiClientError> {
  try {
    const body = (await response.json()) as Partial<ApiErrorBody>;
    if (typeof body.code === 'string' && typeof body.message === 'string') {
      return new ApiClientError(response.status, body.code, body.message, body.fields);
    }
  } catch {
    // The body is not JSON, for example a proxy error page.
  }
  return new ApiClientError(response.status, 'internal_error', FALLBACK_MESSAGE);
}
