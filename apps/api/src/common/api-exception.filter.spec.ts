import { type ArgumentsHost, Logger, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { ApiError } from './api-error.js';
import { ApiExceptionFilter } from './api-exception.filter.js';

function fakeHost() {
  const reply = { status: 0, body: undefined as unknown };
  const response = {
    status(code: number) {
      reply.status = code;
      return this;
    },
    json(body: unknown) {
      reply.body = body;
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ method: 'GET', url: '/api/x' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, reply };
}

describe('ApiExceptionFilter', () => {
  const filter = new ApiExceptionFilter();

  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('ApiError gives its status and body', () => {
    const { host, reply } = fakeHost();
    filter.catch(
      new ApiError(402, 'insufficient_credits', 'No credits left.'),
      host,
    );
    expect(reply.status).toBe(402);
    expect(reply.body).toEqual({
      code: 'insufficient_credits',
      message: 'No credits left.',
    });
  });

  it('ZodError gives 400 invalid_input with field messages', () => {
    const { host, reply } = fakeHost();
    const result = z
      .object({ label: z.string().min(1, 'Enter a label.') })
      .safeParse({ label: '' });
    filter.catch(result.error, host);
    expect(reply.status).toBe(400);
    expect(reply.body).toMatchObject({
      code: 'invalid_input',
      fields: { label: 'Enter a label.' },
    });
  });

  it('an unknown error gives 500 internal_error and no stack in the body', () => {
    const { host, reply } = fakeHost();
    filter.catch(new Error('database is down at 10.0.0.5'), host);
    expect(reply.status).toBe(500);
    expect(reply.body).toEqual({
      code: 'internal_error',
      message: 'Something went wrong. Try again.',
    });
    expect(JSON.stringify(reply.body)).not.toContain('10.0.0.5');
  });

  it('a Nest NotFoundException gives 404 not_found', () => {
    const { host, reply } = fakeHost();
    filter.catch(new NotFoundException(), host);
    expect(reply.status).toBe(404);
    expect(reply.body).toMatchObject({ code: 'not_found' });
  });

  it('a body parser error with status 400 gives 400 invalid_input', () => {
    const { host, reply } = fakeHost();
    filter.catch(
      Object.assign(new SyntaxError('Unexpected token'), {
        status: 400,
        type: 'entity.parse.failed',
      }),
      host,
    );
    expect(reply.status).toBe(400);
    expect(reply.body).toMatchObject({ code: 'invalid_input' });
  });
});
