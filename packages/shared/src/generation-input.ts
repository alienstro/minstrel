import { z } from 'zod';
import type { MusicAdapter } from './adapters.js';

export interface GenerationInput {
  idea: string;
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
  return z.object({
    idea: z.string().trim().min(1).max(TEXT_LIMITS.idea),
    lyrics: z.string().max(TEXT_LIMITS.lyrics).optional(),
    style: z.string().max(TEXT_LIMITS.style).optional(),
    title: z.string().trim().max(TEXT_LIMITS.title).optional(),
    instrumental: z.boolean(),
    model: z.string().min(1).max(100),
    lengthSeconds: z.number().int().min(length.min).max(length.max).optional(),
  });
}
