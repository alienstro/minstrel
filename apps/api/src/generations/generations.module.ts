import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module.js';
import { SAFE_FETCH, safeFetch } from '../net/safe-fetch.js';
import { GenerationsRepo } from './generations.repo.js';
import { SyncService } from './sync.service.js';
import { TrackCopier } from './track-copier.js';

@Module({
  imports: [ConnectionsModule],
  providers: [
    GenerationsRepo,
    TrackCopier,
    SyncService,
    { provide: SAFE_FETCH, useValue: safeFetch },
  ],
  exports: [GenerationsRepo, TrackCopier, SyncService],
})
export class GenerationsModule {}
