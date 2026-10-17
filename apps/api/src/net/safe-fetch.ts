import dns, { type LookupAddress } from 'node:dns';
import { isIP, type LookupFunction } from 'node:net';
import {
  Agent,
  Headers,
  fetch as undiciFetch,
  type RequestInit,
  Response,
} from 'undici';
import { isBlockedAddress } from './ip-policy.js';

// Spec §7.3. Users choose base_url, so they also choose which hosts the API calls. Each outbound call
// to a provider or to an audio URL goes through safeFetch.

export class SafeFetchError extends Error {
  override name = 'SafeFetchError';
}

export type DnsLookup = (
  hostname: string,
  options: dns.LookupAllOptions,
  callback: (
    error: NodeJS.ErrnoException | null,
    addresses: LookupAddress[],
  ) => void,
) => void;

type Transport = (url: string, init: RequestInit) => Promise<Response>;

export interface SafeFetchInit extends Omit<
  RequestInit,
  'redirect' | 'dispatcher'
> {
  /** Time to the response headers. Default 30 s. */
  firstByteTimeoutMs?: number;
  /** Time for the whole call, body included. Default 60 s. A file download uses 5 minutes. */
  totalTimeoutMs?: number;
}

/** The DI token for the SafeFetch that downloads provider audio. A test replaces it with a fake. */
export const SAFE_FETCH = Symbol('SAFE_FETCH');

export type SafeFetch = (
  url: string,
  init?: SafeFetchInit,
) => Promise<Response>;

const MAX_REDIRECTS = 3;
const CONNECT_TIMEOUT_MS = 30_000;
const KEY_HEADERS = ['authorization', 'xi-api-key', 'x-api-key', 'cookie'];

export function createSafeFetch(
  deps: { lookup?: DnsLookup; transport?: Transport } = {},
): SafeFetch & {
  transport: Transport;
} {
  // The lookup runs when undici connects, so the check applies to the IP that the socket uses.
  // A DNS answer that changes between a check and the connect (DNS rebinding) cannot get through.
  const agent = new Agent({
    connect: {
      lookup: guardedLookup(deps.lookup ?? (dns.lookup as DnsLookup)),
      timeout: CONNECT_TIMEOUT_MS,
    },
    headersTimeout: 0, // safeFetch sets its own timers, so each call can choose its limits.
    bodyTimeout: 0,
  });
  const transport: Transport =
    deps.transport ??
    ((url, init) => undiciFetch(url, { ...init, dispatcher: agent }));

  const safeFetch: SafeFetch = async (url, init = {}) => {
    const {
      firstByteTimeoutMs = 30_000,
      totalTimeoutMs = 60_000,
      signal,
      ...request
    } = init;
    const total = abortAfter(
      totalTimeoutMs,
      `The call did not finish in ${totalTimeoutMs / 1000} s`,
    );
    const callerSignals = signal ? [signal, total.signal] : [total.signal];
    let current = new URL(url);
    let method = request.method ?? 'GET';
    let body = request.body;
    const headers = new Headers(request.headers);

    try {
      for (let hop = 0; ; hop++) {
        assertSafeUrl(current);
        const firstByte = abortAfter(
          firstByteTimeoutMs,
          `${current.host} did not answer in ${firstByteTimeoutMs / 1000} s`,
        );
        let response: Response;
        try {
          response = await transport(current.toString(), {
            ...request,
            method,
            body,
            headers,
            redirect: 'manual',
            signal: AbortSignal.any([...callerSignals, firstByte.signal]),
          });
        } catch (error) {
          // undici reports a connect error as "fetch failed" with the lookup error as its cause.
          const cause = (error as { cause?: unknown }).cause;
          throw cause instanceof SafeFetchError ? cause : error;
        } finally {
          firstByte.clear();
        }

        const location = response.headers.get('location');
        if (response.status < 300 || response.status >= 400 || !location)
          return untilBodyEnds(response, total.clear);
        if (hop >= MAX_REDIRECTS)
          throw new SafeFetchError(
            `The call followed more than ${MAX_REDIRECTS} redirects`,
          );
        await response.body?.cancel();

        const next = new URL(location, current);
        if (next.origin !== current.origin)
          for (const name of KEY_HEADERS) headers.delete(name);
        if (
          response.status === 303 ||
          ((response.status === 301 || response.status === 302) &&
            method === 'POST')
        ) {
          method = 'GET';
          body = undefined;
          headers.delete('content-type');
        }
        current = next;
      }
    } catch (error) {
      total.clear();
      throw error;
    }
  };

  return Object.assign(safeFetch, { transport });
}

export const safeFetch = createSafeFetch();

/** The total timer covers the body, so it stops only when the body ends, fails, or is cancelled. */
function untilBodyEnds(response: Response, stop: () => void): Response {
  if (!response.body) {
    stop();
    return response;
  }
  const reader = response.body.getReader();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          stop();
          controller.close();
        } else controller.enqueue(value);
      } catch (error) {
        stop();
        controller.error(error);
      }
    },
    cancel(reason) {
      stop();
      return reader.cancel(reason);
    },
  });
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function assertSafeUrl(url: URL): void {
  if (url.protocol !== 'https:')
    throw new SafeFetchError('Only HTTPS URLs are allowed');
  if (url.port !== '' && url.port !== '443')
    throw new SafeFetchError('Only port 443 is allowed');
  // Node does not call the lookup for an IP literal, so the literal gets the check here.
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) && isBlockedAddress(host))
    throw new SafeFetchError(`The address ${host} is blocked`);
}

function guardedLookup(lookup: DnsLookup): LookupFunction {
  return (hostname, options, callback) => {
    lookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) return callback(error, '');
      if (
        addresses.length === 0 ||
        addresses.some((a) => isBlockedAddress(a.address))
      ) {
        return callback(
          new SafeFetchError(`The address of ${hostname} is blocked`),
          '',
        );
      }
      if (options.all) return callback(null, addresses);
      callback(null, addresses[0]!.address, addresses[0]!.family);
    });
  };
}

function abortAfter(
  ms: number,
  message: string,
): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new SafeFetchError(message)),
    ms,
  );
  timer.unref?.();
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}
