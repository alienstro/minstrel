import { as, signIn, type SignedIn } from './support/session.js';
import { fakeTextProvider } from './support/fake-providers.js';
import { createTestApp, type TestApp } from './support/test-app.js';
import { resetTestDb } from './support/test-db.js';

const textBody = {
  kind: 'text',
  adapter: 'openai_compatible',
  label: 'OpenRouter',
  apiKey: 'sk-or-secret-1111',
  defaultModel: 'gpt-x',
};

describe('assist route (e2e)', () => {
  let t: TestApp;
  let ada: SignedIn;
  const complete = vi.fn(async () => ({ text: '[Verse]\nRain on the roof' }));

  beforeAll(async () => {
    t = await createTestApp({ textProvider: fakeTextProvider({ complete }) });
  });

  beforeEach(async () => {
    await resetTestDb();
    complete.mockClear();
    ada = await signIn(t);
  });

  afterAll(async () => {
    await t.app.close();
  });

  const assist = (session: SignedIn, connectionId: string) =>
    as(t, session).post('/api/assist', {
      connectionId,
      task: 'lyrics',
      idea: 'rain on a tin roof',
    });

  it('it returns the fake provider result', async () => {
    const { id } = (await as(t, ada).post('/api/connections', textBody)).body;
    const res = await assist(ada, id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ text: '[Verse]\nRain on the roof' });
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({ id, apiKey: 'sk-or-secret-1111' }),
      expect.objectContaining({
        task: 'lyrics',
        idea: 'rain on a tin roof',
        model: 'gpt-x',
      }),
    );
  });

  it('a music connection gives 400 invalid_input', async () => {
    const { id } = (
      await as(t, ada).post('/api/connections', {
        kind: 'music',
        adapter: 'kie',
        label: 'kie.ai',
        apiKey: 'sk-kie-2222',
      })
    ).body;
    const res = await assist(ada, id);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_input');
    expect(complete).not.toHaveBeenCalled();
  });

  it("another user's connection gives 404", async () => {
    const { id } = (await as(t, ada).post('/api/connections', textBody)).body;
    const grace = await signIn(t, 'grace@example.com');
    expect((await assist(grace, id)).status).toBe(404);
  });

  it('the 21st call in a minute gives 429', async () => {
    const { id } = (await as(t, ada).post('/api/connections', textBody)).body;
    for (let i = 0; i < 20; i++)
      expect((await assist(ada, id)).status).toBe(200);
    const res = await assist(ada, id);
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('rate_limited');
  });
});
