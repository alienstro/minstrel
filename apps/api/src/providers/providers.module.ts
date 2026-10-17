import { Global, Module } from '@nestjs/common';
import { KieMusicProvider } from './kie.music.js';
import { SunoClassicMusicProvider } from './suno-classic.music.js';
import { OpenAiCompatibleTextProvider } from './openai-compatible.text.js';
import { ProvidersController } from './providers.controller.js';
import {
  MUSIC_PROVIDERS,
  ProviderRegistry,
  TEXT_PROVIDER,
} from './registry.js';
import type { MusicProvider, TextProvider } from './types.js';

@Global()
@Module({
  controllers: [ProvidersController],
  providers: [
    { provide: MUSIC_PROVIDERS, useFactory: (): MusicProvider[] => [new KieMusicProvider(), new SunoClassicMusicProvider()] },
    {
      provide: TEXT_PROVIDER,
      useFactory: (): TextProvider => new OpenAiCompatibleTextProvider(),
    },
    ProviderRegistry,
  ],
  exports: [ProviderRegistry],
})
export class ProvidersModule {}
