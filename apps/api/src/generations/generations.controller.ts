import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { GenerationDto, Page } from '@minstrel/shared';
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

  @Get()
  list(
    @UserId() userId: string,
    @Query('cursor') cursor?: string,
  ): Promise<Page<GenerationDto>> {
    return this.generationsService.list(userId, cursor);
  }

  @Get(':id')
  get(@UserId() userId: string, @Param('id') id: string): Promise<GenerationDto> {
    return this.generationsService.get(userId, id);
  }
}
