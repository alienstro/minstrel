import { timingSafeEqual } from 'node:crypto';
import { Controller, HttpCode, Param, Post, Query } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { z } from 'zod';
import { notFound } from '../common/api-error.js';
import { BackgroundWork } from '../common/background-work.js';
import { GenerationsRepo } from './generations.repo.js';
import { hashToken } from './generations.service.js';
import { SyncService } from './sync.service.js';

const isUuid = (value: string) => z.uuid().safeParse(value).success;

// Spec §5.3 step 2. The callback only says "look now". The API ignores the body and reads the
// task from the provider with the user's key, so a forged body cannot change a song.
@Controller('webhooks')
@AllowAnonymous()
export class WebhookController {
  constructor(
    private readonly repo: GenerationsRepo,
    private readonly sync: SyncService,
    private readonly background: BackgroundWork,
  ) {}

  @Post(':adapter/:generationId')
  @HttpCode(200)
  async callback(
    @Param('adapter') adapter: string,
    @Param('generationId') generationId: string,
    @Query('t') token: unknown,
  ): Promise<void> {
    // Each failed check gives the same 404, so a caller cannot learn which check failed.
    if (typeof token !== 'string' || !token || !isUuid(generationId)) throw notFound();
    const target = await this.repo.callbackTarget(generationId);
    if (
      !target?.callbackTokenHash ||
      target.adapter !== adapter ||
      !timingSafeEqual(hashToken(token), target.callbackTokenHash)
    ) {
      throw notFound();
    }
    this.background.run(() => this.sync.sync(generationId));
  }
}
