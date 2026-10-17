import { Global, Module } from '@nestjs/common';
import { OpenAiCompatibleTextProvider } from './openai-compatible.text.js';
import { ProvidersController } from './providers.controller.js';
import {
  MUSIC_PROVIDERS,
  musicProvidersFromEnv,
  ProviderRegistry,
  TEXT_PROVIDER,
} from './registry.js';
import type { MusicProvider, TextProvider } from './types.js';

@Global()
@Module({
  controllers: [ProvidersController],
  providers: [
    {
      provide: MUSIC_PROVIDERS,
      useFactory: (): MusicProvider[] => musicProvidersFromEnv(),
    },
    {
      provide: TEXT_PROVIDER,
      useFactory: (): TextProvider => new OpenAiCompatibleTextProvider(),
    },
    ProviderRegistry,
  ],
  exports: [ProviderRegistry],
})
export class ProvidersModule {}
