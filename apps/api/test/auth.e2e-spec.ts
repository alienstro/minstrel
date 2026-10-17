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
    .set('x-real-ip', '203.0.113.7')
    .send({ email, password: 'correct horse battery', name: 'Ada' });

// Opens the link of the verification email. Better Auth then signs the user in.
const verify = (t: TestApp) => {
  const url = new URL(t.mailer.verifications.at(-1)!.url);
  return request(t.app.getHttpServer())
    .get(url.pathname + url.search)
    .set('x-real-ip', '203.0.113.7');
};

describe('auth (e2e)', () => {
  let t: TestApp;

  beforeEach(async () => {
    await resetTestDb();
    t = await createTestApp();
  });

  afterEach(async () => {
    await t.app.close();
  });

  it('GET /api/health returns 200 without a session', async () => {
    const res = await request(t.app.getHttpServer()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('sign-up sends one verification email through the fake mailer', async () => {
    const res = await signUp(t, 'ada@example.com');
    expect(res.status).toBe(200);
    expect(t.mailer.verifications).toHaveLength(1);
    expect(t.mailer.verifications[0]!.to).toBe('ada@example.com');
  });

  it('the session cookie is HttpOnly and SameSite=Lax', async () => {
    await signUp(t, 'ada@example.com');
    const res = await verify(t);
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    const session = cookies.find((c) => c.includes('session_token='));
    expect(session).toBeDefined();
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/SameSite=Lax/i);
    expect(session).not.toMatch(/Domain=/i);
  });

  it('Better Auth records the x-real-ip address', async () => {
    await signUp(t, 'ada@example.com');
    await verify(t);
    const db = t.app.get<Db>(DB);
    const { rows } = await db.execute<{ ip_address: string }>(
      sql`SELECT ip_address FROM session`,
    );
    expect(rows.map((r) => r.ip_address)).toEqual(['203.0.113.7']);
  });
});
