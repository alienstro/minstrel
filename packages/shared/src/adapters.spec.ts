import { describe, expect, it } from 'vitest';
import { ADAPTER_KIND, MUSIC_ADAPTERS } from './adapters.js';

describe('adapters', () => {
  it('ADAPTER_KIND marks openai_compatible as text and the others as music', () => {
    expect(ADAPTER_KIND).toEqual({
      kie: 'music',
      suno_classic: 'music',
      elevenlabs: 'music',
      openai_compatible: 'text',
    });
  });

  it('MUSIC_ADAPTERS is kie, suno_classic, elevenlabs in this order', () => {
    expect(MUSIC_ADAPTERS).toEqual(['kie', 'suno_classic', 'elevenlabs']);
  });
});
