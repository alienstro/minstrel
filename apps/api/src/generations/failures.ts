import type { ErrorCode } from '@minstrel/shared';
import { cleanReason } from '../providers/provider-error.js';

// Spec §8. A failed generation stores the code and the message that the UI shows as it is.
export interface Failure {
  code: ErrorCode;
  message: string;
}

export const connectionRemoved = (): Failure => ({
  code: 'connection_removed',
  message:
    'You removed the key for this song before it finished. Add a key, then make the song again.',
});

export const providerTimeout = (label: string): Failure => ({
  code: 'provider_timeout',
  message: `${label} did not finish this song in 30 minutes.`,
});

export const generationFailed = (label: string, reason = ''): Failure => ({
  code: 'generation_failed',
  message: `${label} could not make this song: ${cleanReason(reason)}.`,
});

export const contentRejected = (label: string): Failure => ({
  code: 'content_rejected',
  message: `${label} did not accept some words in the lyrics or the style. Change them, then try again.`,
});
