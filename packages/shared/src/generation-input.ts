import { z } from 'zod';
import type { MusicAdapter } from './adapters.js';

export interface GenerationInput {
  /** What the song is about. A song with lyrics, or an instrumental with a style, needs none. */
  idea?: string;
  lyrics?: string;
  style?: string;
  title?: string;
  instrumental: boolean;
  model: string;
  lengthSeconds?: number;
}

// Spec §5.1.
export const LENGTH_LIMITS: Record<MusicAdapter, { min: number; max: number }> = {
  kie: { min: 10, max: 360 },
};

export const TEXT_LIMITS = { title: 80, style: 1000, lyrics: 5000, idea: 3000 } as const;

export function inputSchemaFor(adapter: MusicAdapter): z.ZodType<GenerationInput> {
  const length = LENGTH_LIMITS[adapter];
  return z
    .object({
      idea: z.string().trim().min(1).max(TEXT_LIMITS.idea).optional(),
      lyrics: z.string().max(TEXT_LIMITS.lyrics).optional(),
      style: z.string().max(TEXT_LIMITS.style).optional(),
      title: z.string().trim().max(TEXT_LIMITS.title).optional(),
      instrumental: z.boolean(),
      model: z.string().min(1).max(100),
      lengthSeconds: z.number().int().min(length.min).max(length.max).optional(),
    })
    .refine(hasSource, { path: ['idea'], message: 'Describe the song, or add lyrics.' });
}

// The provider needs something to make the song from: an idea, lyrics to sing, or the style of an instrumental.
function hasSource(input: GenerationInput): boolean {
  if (input.idea) return true;
  return input.instrumental ? Boolean(input.style?.trim()) : Boolean(input.lyrics?.trim());
}

// The title of a track when the provider gives none: the user's title, the idea, the first sung line, or "Untitled".
export function fallbackTitle(input: GenerationInput): string {
  const firstLine = input.lyrics
    ?.split('\n')
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('['));
  return (input.title || input.idea || firstLine || 'Untitled').slice(0, TEXT_LIMITS.title);
}
