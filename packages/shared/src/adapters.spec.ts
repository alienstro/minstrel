import { describe, expect, it } from 'vitest';
import { ADAPTER_KIND, MUSIC_ADAPTERS } from './adapters.js';
import { createConnectionBodySchema } from './api.js';

describe('adapters', () => {
  it('ADAPTER_KIND marks openai_compatible as text and kie as music', () => {
    expect(ADAPTER_KIND).toEqual({ kie: 'music', openai_compatible: 'text' });
  });

  it('MUSIC_ADAPTERS is kie only', () => {
    expect(MUSIC_ADAPTERS).toEqual(['kie']);
  });

  it('the adapter schema rejects suno_classic and elevenlabs', () => {
    const body = { kind: 'music', label: 'Key', apiKey: 'sk-12345678' };
    expect(createConnectionBodySchema.safeParse({ ...body, adapter: 'kie' }).success).toBe(true);
    expect(createConnectionBodySchema.safeParse({ ...body, adapter: 'suno_classic' }).success).toBe(false);
    expect(createConnectionBodySchema.safeParse({ ...body, adapter: 'elevenlabs' }).success).toBe(false);
  });
});
