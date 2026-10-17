import { ApiError } from '../common/api-error.js';
import { redact } from '../common/logger.js';

const MAX_REASON = 200;

// Spec §8. `label` is the connection label that the user chose, for example "kie.ai".
export function mapProviderError(
  status: number,
  reason: string,
  label: string,
): ApiError {
  if (status === 401 || status === 403) {
    return new ApiError(
      400,
      'invalid_key',
      `${label} did not accept this key. Check the key in Settings → Connections.`,
    );
  }
  if (status === 402) {
    return new ApiError(
      402,
      'insufficient_credits',
      `Your ${label} account has no credits left. Add credits with ${label}, then try again.`,
    );
  }
  if (status === 429) {
    return new ApiError(
      429,
      'provider_rate_limited',
      `${label} is busy. Wait a minute, then try again.`,
    );
  }
  if (status >= 400 && status < 500) {
    return new ApiError(
      422,
      'provider_rejected',
      `${label} did not accept this request: ${cleanReason(reason)}.`,
    );
  }
  // 5xx, a timeout (status 0), or a network error.
  return new ApiError(
    502,
    'provider_unavailable',
    `${label} did not answer. Try again in a few minutes.`,
  );
}

// The reason comes from the provider. It reaches the UI, so it gets the log redaction and a length limit.
export function cleanReason(reason: string): string {
  const text = String(redact(reason))
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.\s]+$/, '');
  if (!text) return 'no reason given';
  return text.length > MAX_REASON ? `${text.slice(0, MAX_REASON)}…` : text;
}
