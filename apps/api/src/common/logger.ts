import type { LoggerOptions } from 'pino';

// Spec §7.4. Pino redacts these paths in each log line, including the request log of pino-http.
export const PINO_REDACT_PATHS = [
  'authorization',
  'cookie',
  'apiKey',
  'key',
  '*.authorization',
  '*.cookie',
  '*.apiKey',
  '*.key',
  '*.headers.authorization',
  '*.headers.cookie',
  '*.headers["xi-api-key"]',
  '*.headers["x-api-key"]',
  '*.headers["set-cookie"]',
  // A 302 Location holds a signed R2 URL or an auth token.
  '*.headers.location',
];

export function loggerOptions(): LoggerOptions {
  return {
    level: process.env.LOG_LEVEL ?? 'info',
    redact: { paths: PINO_REDACT_PATHS, censor: '[Redacted]' },
    serializers: { req: safeRequest },
  };
}

// The query string carries the callback token (?t=) and the email tokens, and the reset path carries
// a token too. The log keeps only the path, with the reset token hidden.
function safeRequest(req: Record<string, unknown>): Record<string, unknown> {
  const { query: _query, ...rest } = req;
  if (typeof rest.url !== 'string') return rest;
  const path = rest.url
    .split('?')[0]!
    .replace(/(\/reset-password\/)[^/]+/, '$1[Redacted]');
  return { ...rest, url: path };
}

const SECRET_NAME = /authorization|cookie|key|secret|token|password/i;
const BEARER = /Bearer\s+[^\s"']+/g;

// Pino paths cannot reach every depth, so provider error bodies go through redact() before the log.
export function redact(value: unknown): unknown {
  if (typeof value === 'string')
    return value.replace(BEARER, 'Bearer [Redacted]');
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([name, inner]) => [
        name,
        SECRET_NAME.test(name) ? '[Redacted]' : redact(inner),
      ]),
    );
  }
  return value;
}
