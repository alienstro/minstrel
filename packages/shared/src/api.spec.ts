import { describe, expect, it } from 'vitest';
import { assistBodySchema } from './api.js';

const base = { connectionId: '0f8fad5b-d9cb-469f-a165-70867728950e' };

describe('assistBodySchema', () => {
  it('Suggest needs no idea when the song has lyrics', () => {
    const body = { ...base, task: 'style', fields: { lyrics: '[Verse] Rain on the roof' } };
    expect(assistBodySchema.safeParse(body).success).toBe(true);
  });

  it('Suggest with no idea and no lyrics fails on the idea', () => {
    const result = assistBodySchema.safeParse({ ...base, task: 'title', fields: { lyrics: '  ' } });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['idea']);
  });

  it('Write lyrics always needs an idea', () => {
    const result = assistBodySchema.safeParse({ ...base, task: 'lyrics', fields: { lyrics: '[Verse] Rain' } });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['idea']);
  });
});
