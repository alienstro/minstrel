import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module.js';
import { SAFE_FETCH, safeFetch } from '../net/safe-fetch.js';
import { DirectRunner } from './direct-runner.js';
import { GenerationsController } from './generations.controller.js';
import { GenerationsRepo } from './generations.repo.js';
import { GenerationsService } from './generations.service.js';
import { SweepController } from './sweep.controller.js';
import { SweepService } from './sweep.service.js';
import { SyncService } from './sync.service.js';
import { TrackCopier } from './track-copier.js';
import { WebhookController } from './webhook.controller.js';

@Module({
  imports: [ConnectionsModule],
  controllers: [GenerationsController, WebhookController, SweepController],
  providers: [
    GenerationsRepo,
    GenerationsService,
    TrackCopier,
    SyncService,
    SweepService,
    DirectRunner,
    { provide: SAFE_FETCH, useValue: safeFetch },
  ],
  exports: [GenerationsRepo, TrackCopier, SyncService, DirectRunner],
})
export class GenerationsModule {}
