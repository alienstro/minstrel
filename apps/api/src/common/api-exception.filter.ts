import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { ErrorCode } from '@minstrel/shared';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from './api-error.js';

// Status codes that Nest or a library can throw, mapped to the codes of spec §8.
const HTTP_CODES: Record<number, { code: ErrorCode; message: string }> = {
  400: { code: 'invalid_input', message: 'This request is not valid.' },
  401: { code: 'unauthorized', message: 'Sign in to continue.' },
  403: { code: 'forbidden', message: 'You cannot do this.' },
  404: { code: 'not_found', message: 'This item does not exist.' },
  415: {
    code: 'unsupported_media_type',
    message: 'Send the request body as JSON.',
  },
  429: {
    code: 'rate_limited',
    message: 'You sent too many requests. Wait a minute, then try again.',
  },
};

const INTERNAL = {
  code: 'internal_error',
  message: 'Something went wrong. Try again.',
} as const;

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const { status, body } = this.toReply(exception);
    if (status >= 500) {
      const request = http.getRequest<Request>();
      this.logger.error(
        `${request.method} ${request.url} failed`,
        exception instanceof Error ? exception.stack : exception,
      );
    }
    response.status(status).json(body);
  }

  private toReply(exception: unknown): { status: number; body: object } {
    if (exception instanceof ApiError)
      return { status: exception.status, body: exception.toBody() };
    if (exception instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of exception.issues) {
        const path = issue.path.join('.') || '_';
        fields[path] ??= issue.message;
      }
      const message = exception.issues[0]?.message ?? HTTP_CODES[400]!.message;
      return { status: 400, body: { code: 'invalid_input', message, fields } };
    }
    const status = statusOf(exception);
    if (status !== undefined && status >= 400 && status < 500) {
      return { status, body: HTTP_CODES[status] ?? HTTP_CODES[400]! };
    }
    return { status: 500, body: INTERNAL };
  }
}

// Nest exceptions have getStatus(). Express body parser errors have a numeric `status`.
function statusOf(exception: unknown): number | undefined {
  if (exception instanceof HttpException) return exception.getStatus();
  const status = (exception as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : undefined;
}
