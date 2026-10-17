import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { ApiError } from './api-error.js';

// The session user ID that the Better Auth guard puts on the request. Each owned query filters on it.
export const UserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const id = context.switchToHttp().getRequest<{ user?: { id?: string } }>()
      .user?.id;
    if (!id) throw new ApiError(401, 'unauthorized', 'Sign in to continue.');
    return id;
  },
);
