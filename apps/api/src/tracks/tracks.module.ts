import { Module } from '@nestjs/common';
import { TracksService } from './tracks.service.js';

@Module({
  providers: [TracksService],
  exports: [TracksService],
})
export class TracksModule {}
