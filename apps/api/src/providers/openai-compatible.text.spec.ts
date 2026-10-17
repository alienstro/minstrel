import { Response } from 'undici';
import type { SafeFetch, SafeFetchInit } from '../net/safe-fetch.js';
import { OpenAiCompatibleTextProvider } from './openai-compatible.text.js';
import type { DecryptedConnection } from './types.js';

const conn: DecryptedConnection = {
  id: 'c1',
  userId: 'u1',
  label: 'My OpenAI',
  baseUrl: 'https://api.openai.example/v1/',
  apiKey: 'sk-test-1234',
  defaultModel: 'gpt-x',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const reply = (content: string) =>
  json(200, { choices: [{ message: { content } }] });

// Records each call and answers with the next queued response.
function fakeFetch(...responses: Response[]) {
  const calls: Array<{ url: string; init: SafeFetchInit; body: any }> = [];
  const fetch: SafeFetch = async (url, init = {}) => {
    calls.push({
      url,
      init,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    });
    return responses.shift()!;
  };
  return { fetch, calls };
}

const request = {
  task: 'lyrics' as const,
  idea: 'rain on a tin roof',
  fields: {},
  model: 'gpt-x',
};

describe('OpenAiCompatibleTextProvider', () => {
  it('complete sends the key, model, and json_schema', async () => {
    const { fetch, calls } = fakeFetch(reply('{"text":"[Verse]\\nDrip drop"}'));
    const result = await new OpenAiCompatibleTextProvider(fetch).complete(
      conn,
      request,
    );
    expect(result).toEqual({ text: '[Verse]\nDrip drop' });
    expect(calls[0]!.url).toBe(
      'https://api.openai.example/v1/chat/completions',
    );
    expect(
      new Headers(calls[0]!.init.headers as HeadersInit).get('authorization'),
    ).toBe('Bearer sk-test-1234');
    expect(calls[0]!.body).toMatchObject({
      model: 'gpt-x',
      max_tokens: 1500,
      response_format: { type: 'json_schema' },
    });
    expect(calls[0]!.init.totalTimeoutMs).toBe(60_000);
  });

  it('a response_format error retries once with JSON in the prompt', async () => {
    const { fetch, calls } = fakeFetch(
      json(400, {
        error: {
          message:
            "Invalid parameter: 'response_format' of type 'json_schema' is not supported",
        },
      }),
      reply('Sure! ```json\n{"text":"Rain Song"}\n```'),
    );
    const result = await new OpenAiCompatibleTextProvider(fetch).complete(
      conn,
      { ...request, task: 'title' },
    );
    expect(result).toEqual({ text: 'Rain Song' });
    expect(calls).toHaveLength(2);
    expect(calls[1]!.body.response_format).toBeUndefined();
    expect(JSON.stringify(calls[1]!.body.messages)).toContain('JSON');
  });

  it('a reply that fails the schema gives provider_rejected', async () => {
    const { fetch } = fakeFetch(reply('{"lyrics":"no text field"}'));
    await expect(
      new OpenAiCompatibleTextProvider(fetch).complete(conn, request),
    ).rejects.toMatchObject({
      code: 'provider_rejected',
    });
  });

  it('listModels maps the model ids', async () => {
    const { fetch, calls } = fakeFetch(
      json(200, { data: [{ id: 'gpt-b' }, { id: 'gpt-a' }] }),
    );
    expect(
      await new OpenAiCompatibleTextProvider(fetch).listModels(conn),
    ).toEqual([
      { id: 'gpt-a', label: 'gpt-a' },
      { id: 'gpt-b', label: 'gpt-b' },
    ]);
    expect(calls[0]!.url).toBe('https://api.openai.example/v1/models');
  });

  it('checkConnection maps 401 to invalid_key', async () => {
    const { fetch } = fakeFetch(
      json(401, { error: { message: 'Incorrect API key' } }),
    );
    expect(
      await new OpenAiCompatibleTextProvider(fetch).checkConnection(conn),
    ).toMatchObject({
      ok: false,
      status: 'invalid_key',
    });
  });
});
