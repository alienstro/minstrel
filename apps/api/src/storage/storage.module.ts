import { Global, Module } from '@nestjs/common';
import { AUDIO_STORE, type AudioStore } from './audio-store.js';
import { R2AudioStore, r2Client, r2EnvFromProcess } from './r2-audio-store.js';

@Global()
@Module({
  providers: [
    {
      provide: AUDIO_STORE,
      useFactory: (): AudioStore => {
        const env = r2EnvFromProcess();
        return new R2AudioStore(r2Client(env), env.R2_BUCKET);
      },
    },
  ],
  exports: [AUDIO_STORE],
})
export class StorageModule {}
