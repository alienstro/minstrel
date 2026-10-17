import { Module } from '@nestjs/common';
import { SAFE_FETCH, safeFetch } from '../net/safe-fetch.js';
import { GenerationsRepo } from './generations.repo.js';
import { TrackCopier } from './track-copier.js';

@Module({
  providers: [GenerationsRepo, TrackCopier, { provide: SAFE_FETCH, useValue: safeFetch }],
  exports: [GenerationsRepo, TrackCopier],
})
export class GenerationsModule {}
