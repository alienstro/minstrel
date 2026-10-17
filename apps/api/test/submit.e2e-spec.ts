import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { GenerationInput } from '@minstrel/shared';
import { DB, type Db } from '../src/db/db.module.js';
import { generations } from '../src/db/schema.js';
import { mapProviderError } from '../src/providers/provider-error.js';
import type { DecryptedConnection } from '../src/providers/types.js';
import { fakeJobProvider } from './support/fake-providers.js';
import { as, signIn, type SignedIn } from './support/session.js';
import { createTestApp, TEST_ORIGIN, type TestApp } from './support/test-app.js';
import { resetTestDb } from './support/test-db.js';

const kieBody = { kind: 'music', adapter: 'kie', label: 'kie.ai', apiKey: 'sk-kie-good-1234' };
const input = { idea: 'rain on a tin roof', instrumental: false, model: 'V5' };

describe('POST /api/generations, job flow (e2e)', () => {
  let t: TestApp;
  let db: Db;
  let ada: SignedIn;
  let connectionId: string;
  const submit =
    vi.fn<(conn: DecryptedConnection, input: GenerationInput, callbackUrl?: string) => Promise<{ taskId: string }>>();

  const create = (session: SignedIn, body: object) =>
    as(t, session).post('/api/generations', body);

  async function row(id: string) {
    const [found] = await db.select().from(generations).where(eq(generations.id, id));
    return found!;
  }

  beforeAll(async () => {
    t = await createTestApp({ musicProviders: [fakeJobProvider('kie', { submit })] });
    db = t.app.get<Db>(DB);
  });

  beforeEach(async () => {
    await resetTestDb();
    submit.mockReset();
    submit.mockResolvedValue({ taskId: 'task-42' });
    ada = await signIn(t);
    connectionId = (await as(t, ada).post('/api/connections', kieBody)).body.id;
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('the fake provider gets the callback URL with the token', async () => {
    const res = await create(ada, { connectionId, input });

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({
      connectionId,
      adapter: 'kie',
      status: 'pending',
      input,
      error: null,
      tracks: [],
    });
    const [conn, sentInput, callbackUrl] = submit.mock.calls[0]!;
    expect(conn).toMatchObject({ id: connectionId, apiKey: 'sk-kie-good-1234' });
    expect(sentInput).toEqual(input);
    const url = new URL(callbackUrl!);
    expect(`${url.origin}${url.pathname}`).toBe(`${TEST_ORIGIN}/api/webhooks/kie/${res.body.id}`);
    // 32 random bytes in base64url.
    expect(url.searchParams.get('t')).toMatch(/^[\w-]{43}$/);
    const saved = await row(res.body.id);
    expect(saved).toMatchObject({ providerTaskId: 'task-42', pollAttempts: 0 });
    expect(saved.nextPollAt).toBeInstanceOf(Date);
  });

  it('the row stores the hash, never the token', async () => {
    const res = await create(ada, { connectionId, input });

    const token = new URL(submit.mock.calls[0]![2]!).searchParams.get('t')!;
    const saved = await row(res.body.id);
    expect(Buffer.from(saved.callbackTokenHash!)).toEqual(
      createHash('sha256').update(token).digest(),
    );
    expect(JSON.stringify(saved)).not.toContain(token);
    expect(JSON.stringify(res.body)).not.toContain(token);
  });

  it('a provider 401 sets failed with invalid_key', async () => {
    submit.mockRejectedValue(mapProviderError(401, 'bad key', 'kie.ai'));

    const res = await create(ada, { connectionId, input });

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({
      status: 'failed',
      error: {
        code: 'invalid_key',
        message: 'kie.ai did not accept this key. Check the key in Settings → Connections.',
      },
    });
    expect(await row(res.body.id)).toMatchObject({
      status: 'failed',
      errorCode: 'invalid_key',
      nextPollAt: null,
    });
  });

  it('an input over the limit gives 400 invalid_input', async () => {
    const res = await create(ada, { connectionId, input: { ...input, idea: 'x'.repeat(3001) } });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_input');
    expect(res.body.fields).toHaveProperty('idea');
    expect(submit).not.toHaveBeenCalled();
    expect(await db.select().from(generations)).toHaveLength(0);
  });

  it('a text connection gives 400', async () => {
    const text = await as(t, ada).post('/api/connections', {
      kind: 'text',
      adapter: 'openai_compatible',
      label: 'OpenRouter',
      apiKey: 'sk-or-1111',
      defaultModel: 'gpt-x',
    });

    const res = await create(ada, { connectionId: text.body.id, input });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_input');
    expect(submit).not.toHaveBeenCalled();
  });

  it("another user's connection gives 404", async () => {
    const grace = await signIn(t, 'grace@example.com');

    const res = await create(grace, { connectionId, input });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('not_found');
    expect(submit).not.toHaveBeenCalled();
  });
});
