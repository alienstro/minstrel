import { Response } from 'undici';
import type { SafeFetch, SafeFetchInit } from '../net/safe-fetch.js';
import { SunoClassicMusicProvider } from './suno-classic.music.js';
import type { DecryptedConnection } from './types.js';

const conn: DecryptedConnection = {
  id: 'c1',
  userId: 'u1',
  adapter: 'suno_classic',
  label: 'My sunoapi',
  baseUrl: 'https://apibox.erweima.ai',
  apiKey: 'suno-key-1234',
  defaultModel: null,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function fakeFetch(...responses: Response[]) {
  const calls: Array<{ url: string; init: SafeFetchInit; body: any }> = [];
  const fetch: SafeFetch = async (url, init = {}) => {
    calls.push({ url, init, body: init.body ? JSON.parse(String(init.body)) : undefined });
    return responses.shift()!;
  };
  return { fetch, calls };
}

// From docs.sunoapi.org: Generate Music, Get Music Generation Details, Get Remaining Credits
// (fetched 2026-10-17).
const generateOk = { code: 200, msg: 'success', data: { taskId: '5c79be8e' } };
const track = {
  id: 'e231-8cadc7dc',
  audio_url: 'https://cdn.suno.example/a1.mp3',
  source_audio_url: '',
  stream_audio_url: 'https://cdn.suno.example/s1',
  source_stream_audio_url: 'https://cdn.suno.example/s1',
  image_url: 'https://cdn.suno.example/a1.jpeg',
  source_image_url: 'https://cdn.suno.example/a1.jpeg',
  prompt: '[lyrics]',
  model_name: 'chirp-v3-5',
  title: 'Iron Man',
  tags: 'electrifying, rock',
  createTime: '2025-01-01 00:00:00',
  duration: 198.44,
};
const details = (status: string, sunoData: object[] = [], extra: object = {}) => ({
  code: 200,
  msg: 'success',
  data: {
    taskId: '5c79be8e',
    parentMusicId: '',
    param: '{}',
    response: { taskId: '5c79be8e', sunoData },
    status,
    type: 'GENERATE',
    operationType: 'generate',
    errorCode: null,
    errorMessage: null,
    ...extra,
  },
});

const input = {
  idea: 'a sea shanty about a lost cat',
  lyrics: '[Verse]\nThe cat set sail',
  style: 'shanty, accordion',
  title: 'The Cat Who Sailed',
  instrumental: false,
  model: 'V6',
};

describe('SunoClassicMusicProvider', () => {
  it('submit sends camelCase fields and callBackUrl', async () => {
    const { fetch, calls } = fakeFetch(json(generateOk));
    const provider = new SunoClassicMusicProvider(fetch);

    const result = await provider.submit(conn, input, 'https://minstrel.example/api/webhooks/suno_classic/g1?t=x');

    expect(result).toEqual({ taskId: '5c79be8e' });
    expect(calls[0]!.url).toBe('https://apibox.erweima.ai/api/v1/generate');
    expect(calls[0]!.init.method).toBe('POST');
    expect(new Headers(calls[0]!.init.headers as HeadersInit).get('authorization')).toBe('Bearer suno-key-1234');
    expect(calls[0]!.body).toEqual({
      customMode: true,
      instrumental: false,
      model: 'V6',
      title: 'The Cat Who Sailed',
      lyrics: '[Verse]\nThe cat set sail',
      style: 'shanty, accordion',
      callBackUrl: 'https://minstrel.example/api/webhooks/suno_classic/g1?t=x',
    });
  });

  it('an idea without lyrics uses the non-custom mode', async () => {
    const { fetch, calls } = fakeFetch(json(generateOk));

    await new SunoClassicMusicProvider(fetch).submit(
      conn,
      { idea: 'a sea shanty', style: 'shanty', instrumental: false, model: 'V6_MINI' },
      'https://minstrel.example/cb',
    );

    expect(calls[0]!.body).toEqual({
      customMode: false,
      instrumental: false,
      model: 'V6_MINI',
      prompt: 'a sea shanty',
      style: 'shanty',
      callBackUrl: 'https://minstrel.example/cb',
    });
  });

  it('the base URL can change', async () => {
    const { fetch, calls } = fakeFetch(json(generateOk), json(details('PENDING')));
    const provider = new SunoClassicMusicProvider(fetch);
    const other = { ...conn, baseUrl: 'https://suno.other.example/' };

    await provider.submit(other, input, 'https://minstrel.example/cb');
    await provider.getTask(other, 'task 1');

    expect(calls[0]!.url).toBe('https://suno.other.example/api/v1/generate');
    expect(calls[1]!.url).toBe('https://suno.other.example/api/v1/generate/record-info?taskId=task%201');
  });

  it('getTask maps PENDING, TEXT_SUCCESS, FIRST_SUCCESS, and SUCCESS', async () => {
    const firstTake = { ...track, audio_url: '' };
    const { fetch } = fakeFetch(
      json(details('PENDING')),
      json(details('TEXT_SUCCESS')),
      json(details('FIRST_SUCCESS', [firstTake])),
      json(details('SUCCESS', [track, { ...track, id: 'f442-11aa' }])),
    );
    const provider = new SunoClassicMusicProvider(fetch);

    expect(await provider.getTask(conn, 't')).toEqual({ state: 'pending', tracks: [] });
    expect(await provider.getTask(conn, 't')).toEqual({ state: 'text_ready', tracks: [] });
    // Before SUCCESS, a take can have only its stream URL.
    expect(await provider.getTask(conn, 't')).toEqual({
      state: 'first_ready',
      tracks: [
        {
          providerTrackId: 'e231-8cadc7dc',
          title: 'Iron Man',
          audioUrl: 'https://cdn.suno.example/s1',
          coverUrl: 'https://cdn.suno.example/a1.jpeg',
          durationSeconds: 198.44,
        },
      ],
    });
    const done = await provider.getTask(conn, 't');
    expect(done.state).toBe('complete');
    expect(done.tracks.map((t) => [t.providerTrackId, t.audioUrl])).toEqual([
      ['e231-8cadc7dc', 'https://cdn.suno.example/a1.mp3'],
      ['f442-11aa', 'https://cdn.suno.example/a1.mp3'],
    ]);
  });

  it('CREATE_TASK_FAILED and GENERATE_AUDIO_FAILED give generation_failed', async () => {
    const { fetch } = fakeFetch(
      json(details('CREATE_TASK_FAILED', [], { errorCode: 400, errorMessage: 'Bad prompt.' })),
      json(details('GENERATE_AUDIO_FAILED', [], { errorCode: 500, errorMessage: null })),
    );
    const provider = new SunoClassicMusicProvider(fetch);

    expect(await provider.getTask(conn, 't')).toEqual({
      state: 'failed',
      tracks: [],
      reason: 'Bad prompt.',
      failureCode: 'generation_failed',
    });
    expect(await provider.getTask(conn, 't')).toMatchObject({
      state: 'failed',
      reason: 'no reason given',
      failureCode: 'generation_failed',
    });
  });

  it('SENSITIVE_WORD_ERROR gives content_rejected', async () => {
    const { fetch } = fakeFetch(json(details('SENSITIVE_WORD_ERROR', [], { errorMessage: 'Sensitive words.' })));

    expect(await new SunoClassicMusicProvider(fetch).getTask(conn, 't')).toMatchObject({
      state: 'failed',
      failureCode: 'content_rejected',
    });
  });

  it('CALLBACK_EXCEPTION with finished takes is complete, and without takes is failed', async () => {
    const { fetch } = fakeFetch(json(details('CALLBACK_EXCEPTION', [track])), json(details('CALLBACK_EXCEPTION')));
    const provider = new SunoClassicMusicProvider(fetch);

    expect((await provider.getTask(conn, 't')).state).toBe('complete');
    expect(await provider.getTask(conn, 't')).toMatchObject({ state: 'failed', failureCode: 'generation_failed' });
  });

  it('checkConnection reads the credit endpoint', async () => {
    const { fetch, calls } = fakeFetch(
      json({ code: 200, msg: 'success', data: 100 }),
      json({ code: 401, msg: 'Unauthorized' }),
    );
    const provider = new SunoClassicMusicProvider(fetch);

    expect(await provider.checkConnection(conn)).toEqual({ ok: true });
    expect(calls[0]!.url).toBe('https://apibox.erweima.ai/api/v1/generate/credit');
    expect(await provider.checkConnection(conn)).toMatchObject({ ok: false, status: 'invalid_key' });
  });
});
