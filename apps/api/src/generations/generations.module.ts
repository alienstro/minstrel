import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module.js';
import { SAFE_FETCH, safeFetch } from '../net/safe-fetch.js';
import { GenerationsController } from './generations.controller.js';
import { GenerationsRepo } from './generations.repo.js';
import { GenerationsService } from './generations.service.js';
import { SyncService } from './sync.service.js';
import { TrackCopier } from './track-copier.js';
import { WebhookController } from './webhook.controller.js';

@Module({
  imports: [ConnectionsModule],
  controllers: [GenerationsController, WebhookController],
  providers: [
    GenerationsRepo,
    GenerationsService,
    TrackCopier,
    SyncService,
    { provide: SAFE_FETCH, useValue: safeFetch },
  ],
  exports: [GenerationsRepo, TrackCopier, SyncService],
})
export class GenerationsModule {}
