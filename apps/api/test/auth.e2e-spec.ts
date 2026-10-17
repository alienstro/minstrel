import request from 'supertest';
import { sql } from 'drizzle-orm';
import { DB, type Db } from '../src/db/db.module.js';
import {
  createTestApp,
  TEST_ORIGIN,
  type TestApp,
} from './support/test-app.js';
import { resetTestDb } from './support/test-db.js';

const signUp = (t: TestApp, email: string) =>
  request(t.app.getHttpServer())
    .post('/api/auth/sign-up/email')
    .set('Origin', TEST_ORIGIN)
    .set('x-real-ip', '172.18.0.5')
    .set('cf-connecting-ip', '203.0.113.7')
    .send({ email, password: 'correct horse battery', name: 'Ada' });

describe('auth (e2e)', () => {
  let t: TestApp;

  beforeEach(async () => {
    await resetTestDb();
    t = await createTestApp();
  });

  afterEach(async () => {
    await t.app.close();
  });

  it('the auth tables get UUID v7 ids from the database', async () => {
    expect((await signUp(t, 'ada@example.com')).status).toBe(200);
    const db = t.app.get<Db>(DB);
    const { rows } = await db.execute<{ id: string }>(
      sql`SELECT id::text FROM "user" UNION ALL SELECT id::text FROM account UNION ALL SELECT id::text FROM session`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(3);
    // The 13th hex digit of a UUID is its version.
    for (const { id } of rows) expect(id[14]).toBe('7');
  });

  it('GET /api/health returns 200 without a session', async () => {
    const res = await request(t.app.getHttpServer()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('in fake mode, sign-up gives a session with no email check', async () => {
    const res = await signUp(t, 'ada@example.com');
    expect(res.status).toBe(200);
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    expect(cookies.some((c) => c.includes('session_token='))).toBe(true);
  });

  it('password sign-up is off outside fake mode', async () => {
    await t.app.close();
    t = await createTestApp({ fakeMode: false });
    const res = await signUp(t, 'ada@example.com');
    expect(res.status).toBe(400);
    const db = t.app.get<Db>(DB);
    const { rows } = await db.execute(sql`SELECT id FROM "user"`);
    expect(rows).toHaveLength(0);
  });

  // An account from before Google-only sign-in still has a password. Production must not accept it.
  it('outside fake mode, an old password account cannot sign in or ask for a reset', async () => {
    expect((await signUp(t, 'ada@example.com')).status).toBe(200);
    await t.app.close();
    t = await createTestApp({ fakeMode: false });
    const server = t.app.getHttpServer();

    const signInRes = await request(server)
      .post('/api/auth/sign-in/email')
      .set('Origin', TEST_ORIGIN)
      .send({ email: 'ada@example.com', password: 'correct horse battery' });
    expect(signInRes.status).toBe(400);
    expect(([] as string[]).concat(signInRes.headers['set-cookie'] ?? []).some((c) => c.includes('session_token='))).toBe(false);

    const resetRes = await request(server)
      .post('/api/auth/request-password-reset')
      .set('Origin', TEST_ORIGIN)
      .send({ email: 'ada@example.com', redirectTo: '/reset-password' });
    expect(resetRes.status).toBe(400);
  });

  it('the session cookie is HttpOnly and SameSite=Lax', async () => {
    const res = await signUp(t, 'ada@example.com');
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    const session = cookies.find((c) => c.includes('session_token='));
    expect(session).toBeDefined();
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/SameSite=Lax/i);
    expect(session).not.toMatch(/Domain=/i);
  });

  it('Better Auth falls back to x-real-ip when cf-connecting-ip is missing', async () => {
    await request(t.app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .set('Origin', TEST_ORIGIN)
      .set('x-real-ip', '192.168.1.20')
      .send({ email: 'lan@example.com', password: 'correct horse battery', name: 'Lan' });
    const db = t.app.get<Db>(DB);
    const { rows } = await db.execute<{ ip_address: string }>(
      sql`SELECT ip_address FROM session`,
    );
    expect(rows.map((r) => r.ip_address)).toEqual(['192.168.1.20']);
  });

  it('Better Auth records the cf-connecting-ip address, not the tunnel address', async () => {
    await signUp(t, 'ada@example.com');
    const db = t.app.get<Db>(DB);
    const { rows } = await db.execute<{ ip_address: string }>(
      sql`SELECT ip_address FROM session`,
    );
    expect(rows.map((r) => r.ip_address)).toEqual(['203.0.113.7']);
  });
});
