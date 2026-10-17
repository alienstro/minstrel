import request from 'supertest';
import { as, signIn, type SignedIn } from './support/session.js';
import {
  createTestApp,
  TEST_ORIGIN,
  type TestApp,
} from './support/test-app.js';
import { resetTestDb } from './support/test-db.js';

const KEY = 'sk-kie-very-secret-4321';
const kieBody = { kind: 'music', adapter: 'kie', label: 'kie.ai', apiKey: KEY };

describe('connections routes (e2e)', () => {
  let t: TestApp;
  let ada: SignedIn;
  const previousLevel = process.env.LOG_LEVEL;

  beforeAll(async () => {
    process.env.LOG_LEVEL = 'info'; // The log test reads the request log.
    t = await createTestApp();
  });

  beforeEach(async () => {
    await resetTestDb();
    ada = await signIn(t);
  });

  afterAll(async () => {
    await t.app.close();
    process.env.LOG_LEVEL = previousLevel;
  });

  it('the routes give 401 without a session', async () => {
    const server = t.app.getHttpServer();
    const id = '0199f0a0-0000-7000-8000-000000000000';
    const replies = await Promise.all([
      request(server).get('/api/connections'),
      request(server)
        .post('/api/connections')
        .set('Origin', TEST_ORIGIN)
        .send(kieBody),
      request(server)
        .patch(`/api/connections/${id}`)
        .set('Origin', TEST_ORIGIN)
        .send({ label: 'x' }),
      request(server)
        .delete(`/api/connections/${id}`)
        .set('Origin', TEST_ORIGIN),
      request(server)
        .post(`/api/connections/${id}/test`)
        .set('Origin', TEST_ORIGIN),
      request(server).get(`/api/connections/${id}/models`),
      request(server).get('/api/providers'),
    ]);
    expect(replies.map((r) => r.status)).toEqual([
      401, 401, 401, 401, 401, 401, 401,
    ]);
    expect(replies[0]!.body.code).toBe('unauthorized');
  });

  it('an ID that is not a UUID gives 404 on PATCH and DELETE', async () => {
    const api = as(t, ada);
    const replies = [
      await api.patch('/api/connections/abc', { label: 'x' }),
      await api.delete('/api/connections/abc'),
    ];
    expect(replies.map((r) => r.status)).toEqual([404, 404]);
    expect(replies.map((r) => r.body.code)).toEqual(['not_found', 'not_found']);
  });

  it('GET /api/providers lists the music adapters', async () => {
    const res = await as(t, ada).get('/api/providers');
    expect(res.status).toBe(200);
    const music = res.body
      .filter((p: { kind: string }) => p.kind === 'music')
      .map((p: { adapter: string }) => p.adapter);
    expect(music).toEqual(['kie', 'suno_classic']);
    expect(
      res.body.find((p: { kind: string }) => p.kind === 'text').adapter,
    ).toBe('openai_compatible');
  });

  it('no response body contains the key', async () => {
    const api = as(t, ada);
    const created = await api.post('/api/connections', kieBody);
    expect(created.status).toBe(201);
    const id = created.body.id;
    const replies = [
      created,
      await api.get('/api/connections'),
      await api.patch(`/api/connections/${id}`, { label: 'kie main' }),
      await api.post(`/api/connections/${id}/test`),
      await api.get(`/api/connections/${id}/models`),
    ];
    expect(replies.map((r) => r.status)).toEqual([201, 200, 200, 200, 200]);
    for (const reply of replies) expect(reply.text).not.toContain(KEY);
    expect((await api.delete(`/api/connections/${id}`)).status).toBe(204);
  });

  it('no log line contains the key after a create', async () => {
    const lines: string[] = [];
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        lines.push(String(chunk));
        return true;
      });
    try {
      await as(t, ada).post('/api/connections', kieBody);
      await as(t, ada).post('/api/connections', { ...kieBody, kind: 'text' }); // a 400 logs too
    } finally {
      write.mockRestore();
    }
    expect(lines.join('')).toContain('/api/connections');
    expect(lines.join('')).not.toContain(KEY);
  });

  it('the 31st test in an hour gives 429', async () => {
    const api = as(t, ada);
    const { id } = (await api.post('/api/connections', kieBody)).body;
    for (let i = 0; i < 30; i++)
      expect((await api.post(`/api/connections/${id}/test`)).status).toBe(200);
    const res = await api.post(`/api/connections/${id}/test`);
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('rate_limited');
  });
});
