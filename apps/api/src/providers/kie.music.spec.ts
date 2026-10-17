import { Response } from 'undici';
import type { SafeFetch, SafeFetchInit } from '../net/safe-fetch.js';
import { KieMusicProvider } from './kie.music.js';
import type { DecryptedConnection } from './types.js';

const conn: DecryptedConnection = {
  id: 'c1',
  userId: 'u1',
  adapter: 'kie',
  label: 'kie.ai',
  baseUrl: 'https://api.kie.ai',
  apiKey: 'kie-key-1234',
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
    calls.push({
      url,
      init,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    });
    return responses.shift()!;
  };
  return { fetch, calls };
}

// From docs.kie.ai: Generate Music and Get Task Details (fetched 2026-10-17).
const createOk = { code: 200, msg: 'success', data: { taskId: '5c79be8e' } };
const record = (state: string, extra: object = {}) => ({
  code: 200,
  msg: 'success',
  data: {
    taskId: '5c79be8e',
    state,
    param: '{}',
    resultJson: '',
    failCode: '',
    failMsg: '',
    ...extra,
  },
});
const successRecord = record('success', {
  response: {
    data: [
      {
        id: 'e231-8cadc7dc',
        audio_url: 'https://cdn.kie.example/a1.mp3',
        stream_audio_url: 'https://cdn.kie.example/s1',
        image_url: 'https://cdn.kie.example/a1.jpeg',
        title: 'Iron Man',
        tags: 'electrifying, rock',
        duration: 198.44,
      },
      {
        id: 'bd15-1873',
        audio_url: 'https://cdn.kie.example/a2.mp3',
        stream_audio_url: 'https://cdn.kie.example/s2',
        image_url: 'https://cdn.kie.example/a2.jpeg',
        title: 'Iron Man',
        tags: 'electrifying, rock',
        duration: 228.28,
      },
    ],
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

describe('KieMusicProvider', () => {
  it('submit sends snake_case fields, the model, and callBackUrl', async () => {
    const { fetch, calls } = fakeFetch(json(createOk));
    const result = await new KieMusicProvider(fetch).submit(
      conn,
      input,
      'https://minstrel.example/api/webhooks/kie/g1?t=tok',
    );
    expect(result).toEqual({ taskId: '5c79be8e' });
    expect(calls[0]!.url).toBe('https://api.kie.ai/api/v1/jobs/createTask');
    expect(
      new Headers(calls[0]!.init.headers as HeadersInit).get('authorization'),
    ).toBe('Bearer kie-key-1234');
    expect(calls[0]!.body).toEqual({
      model: 'ai-music-api/generate',
      callBackUrl: 'https://minstrel.example/api/webhooks/kie/g1?t=tok',
      input: {
        custom_mode: true,
        instrumental: false,
        model: 'V6',
        title: 'The Cat Who Sailed',
        lyrics: '[Verse]\nThe cat set sail',
        style: 'shanty, accordion',
      },
    });
  });

  it('an idea without lyrics uses the non-custom mode with the idea as the prompt', async () => {
    const { fetch, calls } = fakeFetch(json(createOk));
    await new KieMusicProvider(fetch).submit(conn, {
      idea: 'a sea shanty',
      instrumental: false,
      model: 'V6_MINI',
    });
    expect(calls[0]!.body.input).toEqual({
      custom_mode: false,
      instrumental: false,
      model: 'V6_MINI',
      prompt: 'a sea shanty',
    });
  });

  it('lyrics without an idea or a title use custom mode with the first sung line as the title', async () => {
    const { fetch, calls } = fakeFetch(json(createOk));
    await new KieMusicProvider(fetch).submit(conn, {
      lyrics: '[Verse]\nThe cat set sail',
      instrumental: false,
      model: 'V6',
    });
    expect(calls[0]!.body.input).toEqual({
      custom_mode: true,
      instrumental: false,
      model: 'V6',
      title: 'The cat set sail',
      lyrics: '[Verse]\nThe cat set sail',
    });
  });

  it('a length goes out as duration in custom mode only, as kie.ai allows', async () => {
    const { fetch, calls } = fakeFetch(json(createOk), json(createOk));
    const provider = new KieMusicProvider(fetch);
    await provider.submit(conn, { ...input, lengthSeconds: 120 });
    await provider.submit(conn, {
      idea: 'a sea shanty',
      instrumental: false,
      model: 'V6',
      lengthSeconds: 120,
    });
    expect(calls[0]!.body.input).toMatchObject({
      custom_mode: true,
      duration: 120,
    });
    expect(calls[1]!.body.input).not.toHaveProperty('duration');
  });

  it('instrumental sends no lyrics', async () => {
    const { fetch, calls } = fakeFetch(json(createOk));
    await new KieMusicProvider(fetch).submit(conn, {
      ...input,
      instrumental: true,
    });
    expect(calls[0]!.body.input).toEqual({
      custom_mode: true,
      instrumental: true,
      model: 'V6',
      title: 'The Cat Who Sailed',
      style: 'shanty, accordion',
    });
  });

  it('a failure code in a 200 reply maps to the error of spec §8', async () => {
    const { fetch } = fakeFetch(
      json({ code: 402, msg: 'Insufficient credits', data: null }),
    );
    await expect(
      new KieMusicProvider(fetch).submit(conn, input),
    ).rejects.toMatchObject({ code: 'insufficient_credits' });
  });

  it('getTask maps waiting, queuing, generating, success, and fail', async () => {
    const { fetch, calls } = fakeFetch(
      json(record('waiting')),
      json(record('queuing')),
      json(record('generating')),
      json(successRecord),
      json(
        record('fail', { failCode: '500', failMsg: 'Audio generation failed' }),
      ),
    );
    const kie = new KieMusicProvider(fetch);
    const states = [];
    for (let i = 0; i < 4; i++)
      states.push((await kie.getTask(conn, '5c79be8e')).state);
    expect(states).toEqual(['pending', 'pending', 'pending', 'complete']);
    expect(await kie.getTask(conn, '5c79be8e')).toEqual({
      state: 'failed',
      tracks: [],
      reason: 'Audio generation failed',
      failureCode: 'generation_failed',
    });
    expect(calls[0]!.url).toBe(
      'https://api.kie.ai/api/v1/jobs/recordInfo?taskId=5c79be8e',
    );
  });

  it('getTask returns 2 tracks with audio and cover URLs', async () => {
    const { fetch } = fakeFetch(json(successRecord));
    const result = await new KieMusicProvider(fetch).getTask(conn, '5c79be8e');
    expect(result.tracks).toEqual([
      {
        providerTrackId: 'e231-8cadc7dc',
        title: 'Iron Man',
        audioUrl: 'https://cdn.kie.example/a1.mp3',
        coverUrl: 'https://cdn.kie.example/a1.jpeg',
        durationSeconds: 198.44,
      },
      {
        providerTrackId: 'bd15-1873',
        title: 'Iron Man',
        audioUrl: 'https://cdn.kie.example/a2.mp3',
        coverUrl: 'https://cdn.kie.example/a2.jpeg',
        durationSeconds: 228.28,
      },
    ]);
  });

  it('listModels is V6, V6_MINI, V6_WILD', () => {
    expect(
      new KieMusicProvider(fakeFetch().fetch).listModels().map((m) => m.id),
    ).toEqual(['V6', 'V6_MINI', 'V6_WILD']);
  });

  it('checkConnection reads the credit endpoint and maps 401 to invalid_key', async () => {
    const { fetch, calls } = fakeFetch(
      json({ code: 200, msg: 'success', data: 100.5 }),
      json({ code: 401, msg: 'Unauthorized' }),
    );
    const kie = new KieMusicProvider(fetch);
    expect(await kie.checkConnection(conn)).toEqual({ ok: true });
    expect(calls[0]!.url).toBe('https://api.kie.ai/api/v1/chat/credit');
    expect(await kie.checkConnection(conn)).toMatchObject({
      ok: false,
      status: 'invalid_key',
    });
  });
});

// From docs.kie.ai: Generate Lyrics (fetched 2026-10-17). The record keeps the versions in
// resultJson.resultObject.lyricsData.
const lyricsRecord = (state: string, lyricsData: object[]) =>
  record(state, { resultJson: JSON.stringify({ resultObject: { lyricsData } }) });

// A clock that moves only when the provider waits, so the tests run at once.
function fakeTime() {
  let now = 0;
  const waits: number[] = [];
  return {
    waits,
    now: () => now,
    sleep: async (ms: number) => {
      waits.push(ms);
      now += ms;
    },
  };
}

describe('KieMusicProvider.writeLyrics', () => {
  it('writeLyrics creates an ai-music-api/generate-lyrics task and returns the first complete version', async () => {
    const { fetch, calls } = fakeFetch(
      json(createOk),
      json(record('generating')),
      json(
        lyricsRecord('success', [
          { text: '', title: 'Rain', status: 'failed', error_message: 'busy' },
          { text: '[Verse]\nDrip drop', title: 'Rain', status: 'complete' },
          { text: '[Verse]\nSecond', title: 'Rain', status: 'complete' },
        ]),
      ),
    );
    const time = fakeTime();
    const kie = new KieMusicProvider(fetch, time.sleep, time.now);

    const lyrics = await kie.writeLyrics(conn, 'a song about rain');

    expect(lyrics).toBe('[Verse]\nDrip drop');
    expect(calls[0]!.url).toBe('https://api.kie.ai/api/v1/jobs/createTask');
    expect(calls[0]!.body).toEqual({ model: 'ai-music-api/generate-lyrics', input: { prompt: 'a song about rain' } });
    expect(calls[1]!.url).toBe('https://api.kie.ai/api/v1/jobs/recordInfo?taskId=5c79be8e');
    expect(time.waits).toEqual([2000, 2000]);
  });

  it('writeLyrics cuts the prompt to 200 characters', async () => {
    const { fetch, calls } = fakeFetch(
      json(createOk),
      json(lyricsRecord('success', [{ text: 'Words', status: 'complete' }])),
    );
    const time = fakeTime();
    await new KieMusicProvider(fetch, time.sleep, time.now).writeLyrics(conn, `  ${'a'.repeat(250)}  `);
    expect(calls[0]!.body.input.prompt).toBe('a'.repeat(200));
  });

  it('writeLyrics does not split an emoji at the cut', async () => {
    const { fetch, calls } = fakeFetch(
      json(createOk),
      json(lyricsRecord('success', [{ text: 'Words', status: 'complete' }])),
    );
    const time = fakeTime();
    await new KieMusicProvider(fetch, time.sleep, time.now).writeLyrics(conn, `${'a'.repeat(199)}🎵`);
    expect(calls[0]!.body.input.prompt).toBe('a'.repeat(199));
  });

  it('writeLyrics fails when no version is complete', async () => {
    const { fetch } = fakeFetch(
      json(createOk),
      json(lyricsRecord('success', [{ text: '', status: 'failed', error_message: 'busy' }])),
    );
    const time = fakeTime();
    await expect(new KieMusicProvider(fetch, time.sleep, time.now).writeLyrics(conn, 'rain')).rejects.toMatchObject({
      code: 'generation_failed',
      message: 'kie.ai could not write the lyrics: busy',
    });
  });

  it('writeLyrics fails with the reason of a failed task', async () => {
    const { fetch } = fakeFetch(json(createOk), json(record('fail', { failMsg: 'SENSITIVE_WORD_ERROR' })));
    const time = fakeTime();
    await expect(new KieMusicProvider(fetch, time.sleep, time.now).writeLyrics(conn, 'rain')).rejects.toMatchObject({
      code: 'generation_failed',
      message: 'kie.ai could not write the lyrics: SENSITIVE_WORD_ERROR',
    });
  });

  it('writeLyrics stops after the time limit', async () => {
    const pending = Array.from({ length: 40 }, () => json(record('generating')));
    const { fetch, calls } = fakeFetch(json(createOk), ...pending);
    const time = fakeTime();
    await expect(new KieMusicProvider(fetch, time.sleep, time.now).writeLyrics(conn, 'rain')).rejects.toMatchObject({
      code: 'provider_timeout',
    });
    expect(time.now()).toBeLessThanOrEqual(60_000);
    expect(calls.length).toBeLessThanOrEqual(31);
  });

  it('writeLyrics retries a status check that fails, then returns the lyrics', async () => {
    const { fetch, calls } = fakeFetch(
      json(createOk),
      json({ error: 'bad gateway' }, 502),
      json(lyricsRecord('success', [{ text: 'Words', status: 'complete' }])),
    );
    const time = fakeTime();
    await expect(new KieMusicProvider(fetch, time.sleep, time.now).writeLyrics(conn, 'rain')).resolves.toBe('Words');
    expect(calls).toHaveLength(3);
  });

  it('writeLyrics stops after 3 status checks fail in a row', async () => {
    const down = () => json({ error: 'bad gateway' }, 502);
    const { fetch, calls } = fakeFetch(json(createOk), down(), down(), down(), down());
    const time = fakeTime();
    await expect(new KieMusicProvider(fetch, time.sleep, time.now).writeLyrics(conn, 'rain')).rejects.toMatchObject({
      code: 'provider_unavailable',
    });
    expect(calls).toHaveLength(4);
  });

  it('writeLyrics does not retry a key that kie.ai refuses', async () => {
    const { fetch, calls } = fakeFetch(json(createOk), json({ msg: 'unauthorized' }, 401), json(record('generating')));
    const time = fakeTime();
    await expect(new KieMusicProvider(fetch, time.sleep, time.now).writeLyrics(conn, 'rain')).rejects.toMatchObject({
      code: 'invalid_key',
    });
    expect(calls).toHaveLength(2);
  });
});
