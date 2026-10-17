import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';

// Renders with a fresh React Query client: no retries, no cache between tests.
export function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

type Handler = (init: RequestInit | undefined) => unknown;

// A fake API on top of fetch. Each key is "METHOD /path". A handler gives the JSON body, or throws
// a Response for an error reply.
export function fakeApi(routes: Record<string, unknown | Handler>) {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const route = routes[`${method} ${path}`];
    if (route === undefined) return new Response(JSON.stringify({ code: 'not_found', message: 'No route' }), { status: 404 });
    try {
      const body = typeof route === 'function' ? (route as Handler)(init) : route;
      if (body === undefined) return new Response(null, { status: 204 });
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    } catch (error) {
      if (error instanceof Response) return error;
      throw error;
    }
  });
  return { calls, spy };
}
