import { Inject, Injectable, Optional } from '@nestjs/common';
import type { MusicAdapter, ProviderInfo } from '@minstrel/shared';
import { ApiError } from '../common/api-error.js';
import { isFakeMode } from '../common/fake-mode.js';
import { ElevenLabsMusicProvider } from './elevenlabs.music.js';
import { FakeMusicProvider } from './fake.music.js';
import { KieMusicProvider } from './kie.music.js';
import { SunoClassicMusicProvider } from './suno-classic.music.js';
import type { MusicProvider, TextProvider } from './types.js';

export const MUSIC_PROVIDERS = Symbol('MUSIC_PROVIDERS');
export const TEXT_PROVIDER = Symbol('TEXT_PROVIDER');

/** The music providers. With MINSTREL_FAKE_PROVIDERS=1, a fake takes the place of kie only. */
export function musicProvidersFromEnv(
  env: Record<string, string | undefined> = process.env,
): MusicProvider[] {
  return [
    isFakeMode(env) ? new FakeMusicProvider() : new KieMusicProvider(),
    new SunoClassicMusicProvider(),
    new ElevenLabsMusicProvider(),
  ];
}

// Spec §3.2. A new music provider needs one class and one entry in musicProvidersFromEnv.
@Injectable()
export class ProviderRegistry {
  private readonly musicByAdapter: Map<MusicAdapter, MusicProvider>;

  constructor(
    @Optional() @Inject(MUSIC_PROVIDERS) musicProviders: MusicProvider[] = [],
    @Optional()
    @Inject(TEXT_PROVIDER)
    private readonly textProvider?: TextProvider,
  ) {
    this.musicByAdapter = new Map(musicProviders.map((p) => [p.adapter, p]));
  }

  music(adapter: MusicAdapter): MusicProvider {
    const provider = this.musicByAdapter.get(adapter);
    if (!provider)
      throw new ApiError(
        400,
        'invalid_input',
        'Minstrel does not support this music provider yet.',
      );
    return provider;
  }

  text(): TextProvider {
    if (!this.textProvider)
      throw new ApiError(
        400,
        'invalid_input',
        'Minstrel has no text provider yet.',
      );
    return this.textProvider;
  }

  list(): ProviderInfo[] {
    const music: ProviderInfo[] = [...this.musicByAdapter.values()].map(
      (p) => ({
        adapter: p.adapter,
        kind: 'music',
        displayName: p.displayName,
        defaultBaseUrl: p.defaultBaseUrl,
        keyUrl: p.keyUrl,
        capabilities: p.capabilities,
      }),
    );
    const text: ProviderInfo[] = this.textProvider
      ? [
          {
            adapter: this.textProvider.adapter,
            kind: 'text',
            displayName: this.textProvider.displayName,
            defaultBaseUrl: this.textProvider.defaultBaseUrl,
            keyUrl: this.textProvider.keyUrl,
            capabilities: null,
          },
        ]
      : [];
    return [...music, ...text];
  }
}
