// Spec §8. The last four codes have no row in §8; the API gives them for 401, 403, 404, and 415.
export const ERROR_CODES = [
  'invalid_key',
  'insufficient_credits',
  'plan_required',
  'provider_rate_limited',
  'provider_rejected',
  'provider_unavailable',
  'generation_failed',
  'content_rejected',
  'provider_timeout',
  'interrupted',
  'connection_removed',
  'invalid_input',
  'rate_limited',
  'internal_error',
  'unauthorized',
  'forbidden',
  'not_found',
  'unsupported_media_type',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  fields?: Record<string, string>;
}
