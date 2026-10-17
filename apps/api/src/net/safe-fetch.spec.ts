import type { LookupAddress } from 'node:dns';
import { Response } from 'undici';
import {
  createSafeFetch,
  SafeFetchError,
  type DnsLookup,
} from './safe-fetch.js';

// A DNS lookup that resolves each host to one fixed address, so no test reaches the network.
const resolveTo =
  (address: string): DnsLookup =>
  (_host, _options, callback) =>
    callback(null, [
      {
        address,
        family: address.includes(':') ? 6 : 4,
      } satisfies LookupAddress,
    ]);

const redirect = (location: string) =>
  new Response(null, { status: 302, headers: { location } });

describe('safeFetch', () => {
  it('an http URL is rejected', async () => {
    const safeFetch = createSafeFetch({ lookup: resolveTo('8.8.8.8') });
    await expect(safeFetch('http://api.example.com/x')).rejects.toThrow(
      SafeFetchError,
    );
  });

  it('port 8443 is rejected', async () => {
    const safeFetch = createSafeFetch({ lookup: resolveTo('8.8.8.8') });
    await expect(safeFetch('https://api.example.com:8443/x')).rejects.toThrow(
      /port 443/,
    );
  });

  it('an IP literal in a blocked range is rejected', async () => {
    const safeFetch = createSafeFetch({ lookup: resolveTo('8.8.8.8') });
    await expect(safeFetch('https://10.0.0.5/x')).rejects.toThrow(/blocked/);
    await expect(safeFetch('https://[::1]/x')).rejects.toThrow(/blocked/);
  });

  it('a host that resolves to 10.0.0.5 is rejected at connect time', async () => {
    const lookup = vi.fn(resolveTo('10.0.0.5'));
    const safeFetch = createSafeFetch({ lookup });
    await expect(safeFetch('https://rebind.example.com/x')).rejects.toThrow(
      /blocked/,
    );
    expect(lookup).toHaveBeenCalled();
  });

  it('a redirect to a blocked host is rejected', async () => {
    const lookup = vi.fn(resolveTo('169.254.169.254'));
    let calls = 0;
    // The first hop gives a redirect. The second hop goes through the real connector and its lookup.
    const transport = createSafeFetch({ lookup }).transport;
    const fetchWithRedirect = createSafeFetch({
      lookup,
      transport: (url, init) =>
        calls++ === 0
          ? Promise.resolve(redirect('https://metadata.example/'))
          : transport(url, init),
    });
    await expect(
      fetchWithRedirect('https://cdn.example.com/a.mp3'),
    ).rejects.toThrow(/blocked/);
    expect(calls).toBe(2);
    expect(lookup).toHaveBeenCalled();
  });

  it('a fourth redirect is rejected', async () => {
    let calls = 0;
    const safeFetch = createSafeFetch({
      lookup: resolveTo('8.8.8.8'),
      transport: () =>
        Promise.resolve(redirect(`https://cdn.example.com/${++calls}`)),
    });
    await expect(safeFetch('https://cdn.example.com/0')).rejects.toThrow(
      /redirects/,
    );
    expect(calls).toBe(4);
  });

  it('a redirect to http is rejected', async () => {
    const safeFetch = createSafeFetch({
      lookup: resolveTo('8.8.8.8'),
      transport: () => Promise.resolve(redirect('http://cdn.example.com/a')),
    });
    await expect(safeFetch('https://cdn.example.com/0')).rejects.toThrow(
      SafeFetchError,
    );
  });

  it('a cross-origin redirect drops the key headers', async () => {
    const seen: Array<Headers> = [];
    const safeFetch = createSafeFetch({
      lookup: resolveTo('8.8.8.8'),
      transport: (_url, init) => {
        seen.push(new Headers(init.headers as HeadersInit));
        return Promise.resolve(
          seen.length === 1
            ? redirect('https://cdn.other.com/a')
            : new Response('ok'),
        );
      },
    });
    await safeFetch('https://api.example.com/x', {
      headers: { authorization: 'Bearer sk', 'xi-api-key': 'xi' },
    });
    expect(seen[0]!.get('authorization')).toBe('Bearer sk');
    expect(seen[1]!.get('authorization')).toBeNull();
    expect(seen[1]!.get('xi-api-key')).toBeNull();
  });

  describe('timeouts', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('a slow first byte times out after 30 s', async () => {
      const safeFetch = createSafeFetch({
        lookup: resolveTo('8.8.8.8'),
        // A server that never sends headers: the request ends only when the signal aborts.
        transport: (_url, init) =>
          new Promise((_resolve, reject) =>
            init.signal!.addEventListener('abort', () =>
              reject(init.signal!.reason),
            ),
          ),
      });
      const result = safeFetch('https://api.example.com/slow');
      const assertion = expect(result).rejects.toThrow(/30 s/);
      await vi.advanceTimersByTimeAsync(29_999);
      await vi.advanceTimersByTimeAsync(1);
      await assertion;
    });
  });
});
