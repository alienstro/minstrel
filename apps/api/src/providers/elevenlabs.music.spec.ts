import { Response } from 'undici';
import type { SafeFetch, SafeFetchInit } from '../net/safe-fetch.js';
import { ElevenLabsMusicProvider, elevenLabsPrompt } from './elevenlabs.music.js';
import type { DecryptedConnection } from './types.js';

const conn: DecryptedConnection = {
  id: 'c1',
  userId: 'u1',
  adapter: 'elevenlabs',
  label: 'ElevenLabs',
  baseUrl: 'https://api.elevenlabs.io',
  apiKey: 'el-key-1234',
  defaultModel: null,
};

const input = {
  idea: 'a sea shanty about a lost cat',
  lyrics: '[Verse]\nThe cat set sail',
  style: 'shanty, accordion',
  title: 'The Cat Who Sailed',
  instrumental: false,
  model: 'music_v2_5',
  lengthSeconds: 150,
};

function fakeFetch(response: () => Response) {
  const calls: Array<{ url: string; init: SafeFetchInit; body: any }> = [];
  const fetch: SafeFetch = async (url, init = {}) => {
    calls.push({ url, init, body: init.body ? JSON.parse(String(init.body)) : undefined });
    return response();
  };
  return { fetch, calls };
}

const audio = () =>
  new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { 'content-type': 'audio/mpeg', 'song-id': 'song-1' },
  });

describe('ElevenLabsMusicProvider', () => {
  it('the prompt order is style, idea, then lyrics', async () => {
    expect(elevenLabsPrompt(input)).toBe(
      'shanty, accordion\n\na sea shanty about a lost cat\n\nLyrics:\n[Verse]\nThe cat set sail',
    );
    expect(elevenLabsPrompt({ ...input, style: undefined, lyrics: '  ' })).toBe('a sea shanty about a lost cat');
  });

  it('compose sends the request and returns the body as a stream', async () => {
    const { fetch, calls } = fakeFetch(audio);

    const tracks = await new ElevenLabsMusicProvider(fetch).compose(conn, input, new AbortController().signal);

    expect(calls[0]!.url).toBe('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128');
    expect(calls[0]!.init.method).toBe('POST');
    expect(new Headers(calls[0]!.init.headers as HeadersInit).get('xi-api-key')).toBe('el-key-1234');
    expect(calls[0]!.body).toEqual({
      prompt: elevenLabsPrompt(input),
      model_id: 'music_v2_5',
      music_length_ms: 150000,
      force_instrumental: false,
    });
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({ contentType: 'audio/mpeg', durationSeconds: 150 });
    const bytes = new Uint8Array(await new Response(tracks[0]!.body).arrayBuffer());
    expect([...bytes]).toEqual([1, 2, 3]);
  });

  it('instrumental sets force_instrumental and sends no lyrics', async () => {
    const { fetch, calls } = fakeFetch(audio);

    await new ElevenLabsMusicProvider(fetch).compose(conn, { ...input, instrumental: true }, new AbortController().signal);

    expect(calls[0]!.body.force_instrumental).toBe(true);
    expect(calls[0]!.body.prompt).toBe('shanty, accordion\n\na sea shanty about a lost cat');
  });

  it('150 s sends music_length_ms 150000', async () => {
    const { fetch, calls } = fakeFetch(audio);

    await new ElevenLabsMusicProvider(fetch).compose(conn, input, new AbortController().signal);

    expect(calls[0]!.body.music_length_ms).toBe(150000);
  });

  it('401 or 403 on /v1/music for a tested key gives plan_required', async () => {
    for (const status of [401, 403]) {
      const { fetch } = fakeFetch(() => new Response(JSON.stringify({ detail: { message: 'no access' } }), { status }));

      await expect(
        new ElevenLabsMusicProvider(fetch).compose(conn, input, new AbortController().signal),
      ).rejects.toMatchObject({
        code: 'plan_required',
        message: 'ElevenLabs Music needs a paid ElevenLabs plan.',
      });
    }
  });

  it('a 422 shows the provider reason', async () => {
    const { fetch } = fakeFetch(
      () => new Response(JSON.stringify({ detail: [{ loc: ['body', 'prompt'], msg: 'Prompt is too long' }] }), { status: 422 }),
    );

    await expect(
      new ElevenLabsMusicProvider(fetch).compose(conn, input, new AbortController().signal),
    ).rejects.toMatchObject({
      code: 'provider_rejected',
      message: 'ElevenLabs did not accept this request: Prompt is too long.',
    });
  });

  it('the abort signal reaches the request', async () => {
    const controller = new AbortController();
    const { fetch, calls } = fakeFetch(audio);

    await new ElevenLabsMusicProvider(fetch).compose(conn, input, controller.signal);

    expect(calls[0]!.init.signal).toBe(controller.signal);
  });

  it('an aborted call rethrows the abort reason', async () => {
    const controller = new AbortController();
    const reason = new Error('stopped after 240 s');
    const fetch: SafeFetch = async () => {
      controller.abort(reason);
      throw new DOMException('aborted', 'AbortError');
    };

    await expect(new ElevenLabsMusicProvider(fetch).compose(conn, input, controller.signal)).rejects.toBe(reason);
  });

  it('checkConnection reads the user endpoint', async () => {
    const { fetch, calls } = fakeFetch(() => new Response('{}', { status: 200 }));

    expect(await new ElevenLabsMusicProvider(fetch).checkConnection(conn)).toEqual({ ok: true });
    expect(calls[0]!.url).toBe('https://api.elevenlabs.io/v1/user');
  });
});
