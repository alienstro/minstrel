export type MusicAdapter = 'kie' | 'suno_classic' | 'elevenlabs';
export type TextAdapter = 'openai_compatible';
export type Adapter = MusicAdapter | TextAdapter;

export const ADAPTER_KIND: Record<Adapter, 'music' | 'text'> = {
  kie: 'music',
  suno_classic: 'music',
  elevenlabs: 'music',
  openai_compatible: 'text',
};

export const MUSIC_ADAPTERS: readonly MusicAdapter[] = ['kie', 'suno_classic', 'elevenlabs'];
