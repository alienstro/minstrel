export type MusicAdapter = 'kie';
export type TextAdapter = 'openai_compatible';
export type Adapter = MusicAdapter | TextAdapter;

export const ADAPTER_KIND: Record<Adapter, 'music' | 'text'> = {
  kie: 'music',
  openai_compatible: 'text',
};

export const MUSIC_ADAPTERS: readonly MusicAdapter[] = ['kie'];
