import { Writable } from 'node:stream';
import pino from 'pino';
import { loggerOptions, redact } from './logger.js';

describe('logger', () => {
  it('redact hides authorization, cookie, apiKey, and nested key fields', () => {
    const out = redact({
      authorization: 'Bearer sk-1',
      cookie: 'session=abc',
      apiKey: 'sk-2',
      nested: {
        key: 'sk-3',
        xi_api_key: 'sk-4',
        deeper: [{ secretKey: 'sk-5' }],
      },
    });
    expect(JSON.stringify(out)).not.toMatch(/sk-\d|session=abc/);
    expect(out).toMatchObject({
      authorization: '[Redacted]',
      nested: { key: '[Redacted]' },
    });
  });

  it('redact keeps the other fields', () => {
    const body = {
      error: { message: 'Invalid model', code: 400 },
      list: [1, 'two'],
    };
    expect(redact(body)).toEqual(body);
  });

  it('redact hides a bearer token inside a string', () => {
    expect(
      redact({ message: 'header was Bearer sk-live-123 and failed' }),
    ).toEqual({
      message: 'header was Bearer [Redacted] and failed',
    });
  });

  it('a logged request with an Authorization header has no key in the output', () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, done) {
        lines.push(String(chunk));
        done();
      },
    });
    const logger = pino(loggerOptions(), stream);
    logger.info({
      req: {
        method: 'POST',
        headers: {
          authorization: 'Bearer sk-secret',
          cookie: 'c=1',
          'xi-api-key': 'xi-secret',
        },
      },
      provider: { apiKey: 'sk-other' },
    });
    const output = lines.join('');
    expect(output).toContain('POST');
    expect(output).not.toMatch(/sk-secret|xi-secret|sk-other|c=1/);
  });

  it('a logged request URL keeps no query string and no reset token', () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, done) {
        lines.push(String(chunk));
        done();
      },
    });
    const logger = pino(loggerOptions(), stream);
    logger.info({
      req: {
        method: 'POST',
        url: '/api/webhooks/kie/0199?t=cb-secret',
        query: { t: 'cb-secret' },
      },
    });
    logger.info({
      req: {
        method: 'GET',
        url: '/api/auth/reset-password/reset-secret?callbackURL=%2F',
      },
    });
    const output = lines.join('');
    expect(output).toContain('/api/webhooks/kie/0199');
    expect(output).not.toMatch(/cb-secret|reset-secret/);
  });
});
