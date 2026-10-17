import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { GenerationDto } from '@minstrel/shared';
import { UserThrottlerGuard } from '../common/pg-throttler.storage.js';
import { UserId } from '../common/user-id.decorator.js';
import { GenerationsService } from './generations.service.js';

@Controller('generations')
export class GenerationsController {
  constructor(private readonly generationsService: GenerationsService) {}

  // Spec §7.4: 10 generations for each user in a minute. The reply comes before the song is done.
  @Post()
  @HttpCode(202)
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(@UserId() userId: string, @Body() body: unknown): Promise<GenerationDto> {
    return this.generationsService.create(userId, body);
  }
}
