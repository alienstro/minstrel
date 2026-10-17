import { ApiClientError, apiFetch } from './api';

const respond = (status: number, body: string, contentType = 'application/json') =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body, { status, headers: { 'content-type': contentType } }));

describe('apiFetch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a 2xx response returns the JSON', async () => {
    const fetch = respond(200, JSON.stringify({ items: [1] }));
    await expect(apiFetch('/api/tracks')).resolves.toEqual({ items: [1] });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('/api/tracks');
    expect(init?.credentials).toBe('same-origin');
  });

  it('sends a JSON body with the JSON content type', async () => {
    const fetch = respond(201, JSON.stringify({ id: '1' }));
    await apiFetch('/api/connections', { method: 'POST', body: JSON.stringify({ label: 'x' }) });
    expect(new Headers(fetch.mock.calls[0]![1]?.headers).get('content-type')).toBe('application/json');
  });

  it('a 204 response returns undefined', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    await expect(apiFetch('/api/tracks/1', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('an error body becomes ApiClientError with code and message', async () => {
    respond(400, JSON.stringify({ code: 'invalid_input', message: 'Enter a label.', fields: { label: 'Enter a label.' } }));
    const error = await apiFetch('/api/connections').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({ status: 400, code: 'invalid_input', message: 'Enter a label.', fields: { label: 'Enter a label.' } });
  });

  it('a non-JSON error becomes internal_error', async () => {
    respond(502, '<html>Bad gateway</html>', 'text/html');
    await expect(apiFetch('/api/tracks')).rejects.toMatchObject({ status: 502, code: 'internal_error' });
  });
});
