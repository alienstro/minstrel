import request from 'supertest';
import { TEST_ORIGIN, type TestApp } from './test-app.js';

export interface SignedIn {
  cookie: string;
  userId: string;
}

// Signs up with a password, which only fake mode allows, and returns the session cookie that Better
// Auth sets.
export async function signIn(
  t: TestApp,
  email = 'ada@example.com',
): Promise<SignedIn> {
  const signUp = await request(t.app.getHttpServer())
    .post('/api/auth/sign-up/email')
    .set('Origin', TEST_ORIGIN)
    .send({ email, password: 'correct horse battery', name: 'Ada' });
  const userId: string = signUp.body.user.id;
  const cookies = ([] as string[]).concat(signUp.headers['set-cookie'] ?? []);
  const cookie = cookies.map((c) => c.split(';')[0]).join('; ');
  return { cookie, userId };
}

// A request helper with the session cookie and the web Origin, for routes behind both guards.
export function as(t: TestApp, session: SignedIn) {
  const server = t.app.getHttpServer();
  return {
    get: (path: string) =>
      request(server).get(path).set('Cookie', session.cookie),
    post: (path: string, body?: object) =>
      request(server)
        .post(path)
        .set('Cookie', session.cookie)
        .set('Origin', TEST_ORIGIN)
        .send(body),
    patch: (path: string, body: object) =>
      request(server)
        .patch(path)
        .set('Cookie', session.cookie)
        .set('Origin', TEST_ORIGIN)
        .send(body),
    delete: (path: string) =>
      request(server)
        .delete(path)
        .set('Cookie', session.cookie)
        .set('Origin', TEST_ORIGIN),
  };
}
