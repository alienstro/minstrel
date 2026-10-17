import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiError } from './api-error.js';

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
// Better Auth checks the origin of its own routes. Provider callbacks come from servers and have no Origin.
const EXEMPT = ['/api/auth/', '/api/webhooks/'];

// Spec §7.4 CSRF rule: a mutating request must come from WEB_ORIGIN and carry a JSON body.
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly webOrigin = process.env.WEB_ORIGIN;

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (
      !MUTATING.has(request.method) ||
      EXEMPT.some((prefix) => request.path.startsWith(prefix))
    ) {
      return true;
    }
    if (!this.webOrigin || request.headers.origin !== this.webOrigin) {
      throw new ApiError(
        403,
        'forbidden',
        'This request did not come from Minstrel.',
      );
    }
    if (hasBody(request) && !request.is('application/json')) {
      throw new ApiError(
        415,
        'unsupported_media_type',
        'Send the request body as JSON.',
      );
    }
    return true;
  }
}

// A browser sends Content-Length: 0 for a POST without a body. That request has no body to check.
function hasBody(request: Request): boolean {
  if (request.headers['transfer-encoding'] !== undefined) return true;
  const length = Number(request.headers['content-length'] ?? 0);
  return Number.isFinite(length) && length > 0;
}
