import { Controller, Get, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { UserThrottlerGuard } from '../src/common/pg-throttler.storage.js';
import { DB, type Db } from '../src/db/db.module.js';
import { createTestApp, type TestApp } from './support/test-app.js';
import { resetTestDb } from './support/test-db.js';

@Controller()
@AllowAnonymous()
class LimitedController {
  @Get('limited')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  get() {
    return { ok: true };
  }
}

// Behind the Cloudflare Tunnel, Traefik sets x-real-ip to the tunnel container for every request,
// and Cloudflare sends the user IP in cf-connecting-ip.
const hit = (t: TestApp, ip = '198.51.100.9') =>
  request(t.app.getHttpServer())
    .get('/api/limited')
    .set('x-real-ip', '172.18.0.5')
    .set('cf-connecting-ip', ip);

describe('rate limits on Postgres (e2e)', () => {
  let a: TestApp;
  let b: TestApp;

  beforeAll(async () => {
    a = await createTestApp({ controllers: [LimitedController] });
    b = await createTestApp({ controllers: [LimitedController] });
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await a.app.close();
    await b.app.close();
  });

  it('two Nest app instances on one Postgres share one count', async () => {
    expect((await hit(a)).status).toBe(200);
    expect((await hit(b)).status).toBe(200);
    expect((await hit(a)).status).toBe(429);
  });

  it('each Cloudflare client IP gets its own count', async () => {
    await hit(a);
    await hit(a);
    expect((await hit(a)).status).toBe(429);
    expect((await hit(a, '203.0.113.50')).status).toBe(200);
  });

  it('falls back to x-real-ip when cf-connecting-ip is missing', async () => {
    const lan = (ip: string) =>
      request(a.app.getHttpServer()).get('/api/limited').set('x-real-ip', ip);
    await lan('192.168.1.20');
    await lan('192.168.1.20');
    expect((await lan('192.168.1.20')).status).toBe(429);
    expect((await lan('192.168.1.21')).status).toBe(200);
  });

  it('the request over the limit gives 429 rate_limited', async () => {
    await hit(a);
    await hit(a);
    const res = await hit(a);
    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      code: 'rate_limited',
      message: 'You sent too many requests. Wait a minute, then try again.',
    });
  });

  it('the count starts again after reset_at', async () => {
    await hit(a);
    await hit(a);
    await a.app
      .get<Db>(DB)
      .execute(
        sql`UPDATE rate_limits SET reset_at = now() - interval '1 second'`,
      );
    expect((await hit(a)).status).toBe(200);
  });
});
