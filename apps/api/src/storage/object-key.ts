// Spec §4.4 and §5.5. Each object of a user sits under users/<userId>/, so an account deletion can
// remove all of them with one prefix.

const DEFAULT_AUDIO = 'audio/mpeg';

// Spec §5.5: the copy stops when a file is larger.
export const AUDIO_MAX_BYTES = 50 * 1024 * 1024;
export const COVER_MAX_BYTES = 5 * 1024 * 1024;

/** Keeps a provider type that starts with audio/. Any other type becomes audio/mpeg. */
export function normalizeAudioType(type: string | null | undefined): string {
  const base = (type ?? '').split(';')[0]!.trim().toLowerCase();
  return base.startsWith('audio/') ? base : DEFAULT_AUDIO;
}

export function audioExt(type: string): 'mp3' | 'wav' | 'm4a' {
  if (/wav|wave/.test(type)) return 'wav';
  if (/mp4|m4a|aac/.test(type)) return 'm4a';
  return 'mp3';
}

export const userPrefix = (userId: string) => `users/${userId}/`;

export const trackAudioKey = (userId: string, trackId: string, type: string) =>
  `${userPrefix(userId)}tracks/${trackId}.${audioExt(type)}`;

export const trackCoverKey = (userId: string, trackId: string) =>
  `${userPrefix(userId)}tracks/${trackId}.jpg`;
