import { sql } from 'drizzle-orm';
import { ConnectionsService } from '../src/connections/connections.service.js';
import { DB, type Db } from '../src/db/db.module.js';
import { insertUser } from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';
import { resetTestDb } from './support/test-db.js';

const kieBody = {
  kind: 'music',
  adapter: 'kie',
  label: 'kie.ai',
  apiKey: 'sk-kie-secret-9876',
} as const;

describe('ConnectionsService (e2e)', () => {
  let t: TestApp;
  let db: Db;
  let service: ConnectionsService;
  let userId: string;

  beforeAll(async () => {
    t = await createTestApp();
    db = t.app.get<Db>(DB);
    service = t.app.get(ConnectionsService);
  });

  beforeEach(async () => {
    await resetTestDb();
    userId = await insertUser(db);
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('create stores ciphertext and key_last4, never the key', async () => {
    const created = await service.create(userId, kieBody);
    expect(created).toMatchObject({
      label: 'kie.ai',
      keyLast4: '9876',
      status: 'unchecked',
    });
    expect(created.baseUrl).toBe('https://kie.example.com');
    const { rows } = await db.execute(sql`SELECT * FROM provider_connections`);
    expect(JSON.stringify(rows)).not.toContain('sk-kie-secret');
    expect(rows[0]).toMatchObject({ key_last4: '9876', key_version: 1 });
    expect((await service.decrypted(userId, created.id)).apiKey).toBe(
      'sk-kie-secret-9876',
    );
  });

  it('list returns no key fields', async () => {
    await service.create(userId, kieBody);
    const [item] = await service.list(userId);
    expect(Object.keys(item!).sort()).toEqual(
      [
        'adapter',
        'baseUrl',
        'createdAt',
        'defaultModel',
        'id',
        'keyLast4',
        'kind',
        'label',
        'lastCheckedAt',
        'status',
      ].sort(),
    );
    expect(JSON.stringify(item)).not.toContain('sk-kie-secret');
  });

  it('a duplicate label fails on label', async () => {
    await service.create(userId, kieBody);
    await expect(
      service.create(userId, { ...kieBody, apiKey: 'sk-kie-other-1234' }),
    ).rejects.toMatchObject({
      status: 400,
      code: 'invalid_input',
      fields: { label: expect.any(String) },
    });
  });

  it('a text adapter with kind music fails', async () => {
    await expect(
      service.create(userId, {
        ...kieBody,
        adapter: 'openai_compatible',
        label: 'gpt',
      }),
    ).rejects.toMatchObject({
      code: 'invalid_input',
      fields: { kind: expect.any(String) },
    });
  });

  it('an http base_url fails', async () => {
    await expect(
      service.create(userId, { ...kieBody, baseUrl: 'http://api.kie.ai' }),
    ).rejects.toThrow();
  });

  it("another user's id gives 404", async () => {
    const created = await service.create(userId, kieBody);
    const other = await insertUser(db, 'grace@example.com');
    await expect(service.decrypted(other, created.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      service.update(other, created.id, { label: 'mine' }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(service.remove(other, created.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(service.test(other, created.id)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('test sets status ok or invalid_key', async () => {
    const good = await service.create(userId, kieBody);
    const bad = await service.create(userId, {
      ...kieBody,
      label: 'bad',
      apiKey: 'sk-bad-key-0000',
    });
    expect(await service.test(userId, good.id)).toMatchObject({
      status: 'ok',
      lastCheckedAt: expect.any(String),
    });
    expect(await service.test(userId, bad.id)).toMatchObject({
      status: 'invalid_key',
    });
  });
});
