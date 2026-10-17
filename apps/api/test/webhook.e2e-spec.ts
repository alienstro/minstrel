import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { MockInstance } from 'vitest';
import { DB, type Db } from '../src/db/db.module.js';
import { generations } from '../src/db/schema.js';
import { hashToken } from '../src/generations/generations.service.js';
import { SyncService } from '../src/generations/sync.service.js';
import { insertUser } from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';
import { resetTestDb } from './support/test-db.js';

const TOKEN = 'a'.repeat(43);

describe('POST /api/webhooks/:adapter/:generationId (e2e)', () => {
  let t: TestApp;
  let db: Db;
  let id: string;
  let sync: MockInstance<SyncService['sync']>;

  const callback = (path: string) => request(t.app.getHttpServer()).post(path);

  beforeAll(async () => {
    t = await createTestApp();
    db = t.app.get<Db>(DB);
    sync = vi.spyOn(t.app.get(SyncService), 'sync').mockResolvedValue();
  });

  beforeEach(async () => {
    await resetTestDb();
    sync.mockClear();
    t.background.queue.length = 0;
    const userId = await insertUser(db);
    const [row] = await db
      .insert(generations)
      .values({
        userId,
        adapter: 'kie',
        status: 'pending',
        providerTaskId: 'task-1',
        input: { idea: 'a song', instrumental: false, model: 'V5' },
        callbackTokenHash: hashToken(TOKEN),
      })
      .returning({ id: generations.id });
    id = row!.id;
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('the right token gives 200 and schedules one sync', async () => {
    const res = await callback(`/api/webhooks/kie/${id}?t=${TOKEN}`).send({ code: 200 });

    expect(res.status).toBe(200);
    // The reply comes first. The sync runs after it.
    expect(sync).not.toHaveBeenCalled();
    expect(t.background.queue).toHaveLength(1);
    await t.background.drain();
    expect(sync).toHaveBeenCalledExactlyOnceWith(id);
  });

  it('a wrong token gives 404', async () => {
    const res = await callback(`/api/webhooks/kie/${id}?t=${'b'.repeat(43)}`).send({});

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('not_found');
    expect(t.background.queue).toHaveLength(0);
  });

  it('a missing token gives 404', async () => {
    const res = await callback(`/api/webhooks/kie/${id}`).send({});

    expect(res.status).toBe(404);
    expect(t.background.queue).toHaveLength(0);
  });

  it('an unknown id gives 404', async () => {
    const res = await callback(`/api/webhooks/kie/${randomUUID()}?t=${TOKEN}`).send({});

    expect(res.status).toBe(404);
    expect(t.background.queue).toHaveLength(0);
  });

  it('an id that is not a UUID gives 404', async () => {
    const res = await callback(`/api/webhooks/kie/not-a-uuid?t=${TOKEN}`).send({});

    expect(res.status).toBe(404);
    expect(t.background.queue).toHaveLength(0);
  });

  it('an adapter that does not match the row gives 404', async () => {
    const res = await callback(`/api/webhooks/openai_compatible/${id}?t=${TOKEN}`).send({});

    expect(res.status).toBe(404);
    expect(t.background.queue).toHaveLength(0);
  });

  it('a body that is not JSON still gives 200', async () => {
    const res = await callback(`/api/webhooks/kie/${id}?t=${TOKEN}`)
      .set('Content-Type', 'application/json')
      .send('{not json');

    expect(res.status).toBe(200);
    expect(t.background.queue).toHaveLength(1);
  });
});
