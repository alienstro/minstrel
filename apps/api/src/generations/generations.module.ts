import { Module } from '@nestjs/common';
import { GenerationsRepo } from './generations.repo.js';

@Module({
  providers: [GenerationsRepo],
  exports: [GenerationsRepo],
})
export class GenerationsModule {}
