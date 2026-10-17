import type { SafeFetch } from '../net/safe-fetch.js';
import { errorFromResponse, mapProviderError } from './provider-error.js';
import type { DecryptedConnection } from './types.js';

const API_TIMEOUT_MS = 30_000;

// kie.ai and sunoapi.org wrap each reply in { code, msg, data }. The HTTP status can be 200 when the
// request failed, so the `code` field decides.
export async function callEnvelope<T>(
  fetch: SafeFetch,
  conn: DecryptedConnection,
  path: string,
  init: { method: 'GET' | 'POST'; body?: object } = { method: 'GET' },
): Promise<T> {
  let response;
  try {
    response = await fetch(`${conn.baseUrl.replace(/\/+$/, '')}${path}`, {
      method: init.method,
      body: init.body ? JSON.stringify(init.body) : undefined,
      headers: {
        authorization: `Bearer ${conn.apiKey}`,
        'content-type': 'application/json',
      },
      totalTimeoutMs: API_TIMEOUT_MS,
    });
  } catch {
    throw mapProviderError(0, '', conn.label);
  }
  if (!response.ok) throw await errorFromResponse(response, conn.label);
  const body = (await response.json().catch(() => null)) as {
    code?: unknown;
    msg?: unknown;
    data?: T;
  } | null;
  if (!body || typeof body.code !== 'number')
    throw mapProviderError(0, '', conn.label);
  if (body.code !== 200)
    throw mapProviderError(
      body.code,
      typeof body.msg === 'string' ? body.msg : '',
      conn.label,
    );
  return body.data as T;
}
