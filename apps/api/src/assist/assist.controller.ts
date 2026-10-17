import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AssistResult } from '@minstrel/shared';
import { UserThrottlerGuard } from '../common/pg-throttler.storage.js';
import { UserId } from '../common/user-id.decorator.js';
import { AssistService } from './assist.service.js';

@Controller('assist')
export class AssistController {
  constructor(private readonly assistService: AssistService) {}

  // Spec §7.4: 20 assist calls for each user in a minute.
  @Post()
  @HttpCode(200)
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  assist(
    @UserId() userId: string,
    @Body() body: unknown,
  ): Promise<AssistResult> {
    return this.assistService.assist(userId, body);
  }
}
