import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
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
    if (!MUTATING.has(request.method) || EXEMPT.some((prefix) => request.path.startsWith(prefix))) {
      return true;
    }
    if (!this.webOrigin || request.headers.origin !== this.webOrigin) {
      throw new ApiError(403, 'forbidden', 'This request did not come from Minstrel.');
    }
    // req.is() gives null when the request has no body, and false when the body is not JSON.
    if (request.is('application/json') === false) {
      throw new ApiError(415, 'unsupported_media_type', 'Send the request body as JSON.');
    }
    return true;
  }
}
