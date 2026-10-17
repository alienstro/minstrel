import { fallbackTitle, type GenerationInput } from '@minstrel/shared';

export interface SunoMode {
  custom: boolean;
  /** The lyrics to sing. None for an instrumental. */
  lyrics?: string;
  /** Custom mode needs a title: the user's title, or a fallback from the idea or the lyrics. */
  title: string;
}

// kie.ai runs Suno. Custom mode sings the given lyrics, or makes an instrumental in
// the given style. Without lyrics, the non-custom mode writes lyrics from the idea.
export function sunoMode(input: GenerationInput): SunoMode {
  const lyrics = input.instrumental ? undefined : input.lyrics?.trim() || undefined;
  return {
    custom: Boolean(lyrics) || (input.instrumental && Boolean(input.style)),
    lyrics,
    title: fallbackTitle(input),
  };
}
