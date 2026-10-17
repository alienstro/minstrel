import type { ApiErrorBody, ErrorCode } from '@minstrel/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  toBody(): ApiErrorBody {
    return this.fields
      ? { code: this.code, message: this.message, fields: this.fields }
      : { code: this.code, message: this.message };
  }
}

export const notFound = () =>
  new ApiError(404, 'not_found', 'This item does not exist.');
