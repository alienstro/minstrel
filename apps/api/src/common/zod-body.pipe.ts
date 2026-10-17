import type { PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

// Use as @Body(new ZodBodyPipe(schema)). A ZodError goes to ApiExceptionFilter as 400 invalid_input.
export class ZodBodyPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    return this.schema.parse(value);
  }
}
