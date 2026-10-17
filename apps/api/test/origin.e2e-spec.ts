import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import request from 'supertest';
import {
  createTestApp,
  TEST_ORIGIN,
  type TestApp,
} from './support/test-app.js';

@Controller()
@AllowAnonymous()
class ProbeController {
  @Post('probe')
  @HttpCode(200)
  post(@Body() body: unknown) {
    return { body };
  }

  @Get('probe')
  get() {
    return { ok: true };
  }

  @Post('webhooks/probe')
  @HttpCode(200)
  webhook() {
    return { ok: true };
  }
}

describe('origin guard (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ controllers: [ProbeController] });
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('a POST with the web origin and JSON passes', async () => {
    const res = await request(t.app.getHttpServer())
      .post('/api/probe')
      .set('Origin', TEST_ORIGIN)
      .send({ a: 1 });
    expect(res.status).toBe(200);
  });

  it('a POST with a foreign Origin gives 403', async () => {
    const res = await request(t.app.getHttpServer())
      .post('/api/probe')
      .set('Origin', 'https://evil.example')
      .send({ a: 1 });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('forbidden');
  });

  it('a POST without Origin gives 403', async () => {
    const res = await request(t.app.getHttpServer())
      .post('/api/probe')
      .send({ a: 1 });
    expect(res.status).toBe(403);
  });

  it('a POST with form data gives 415', async () => {
    const res = await request(t.app.getHttpServer())
      .post('/api/probe')
      .set('Origin', TEST_ORIGIN)
      .type('form')
      .send('a=1');
    expect(res.status).toBe(415);
    expect(res.body.code).toBe('unsupported_media_type');
  });

  it('a POST with no body passes', async () => {
    const res = await request(t.app.getHttpServer())
      .post('/api/probe')
      .set('Origin', TEST_ORIGIN)
      .set('Content-Length', '0');
    expect(res.status).toBe(200);
  });

  it('a webhook POST without Origin passes the guard', async () => {
    const res = await request(t.app.getHttpServer())
      .post('/api/webhooks/probe')
      .send({ a: 1 });
    expect(res.status).toBe(200);
  });

  it('a GET without Origin passes', async () => {
    const res = await request(t.app.getHttpServer()).get('/api/probe');
    expect(res.status).toBe(200);
  });
});
