import { createHash, timingSafeEqual } from 'node:crypto';
import { Controller, Get, Headers } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { ApiError } from '../common/api-error.js';
import { SweepService, type SweepResult } from './sweep.service.js';

const sha256 = (value: string) => createHash('sha256').update(value).digest();

// Spec §2.3. Vercel Cron calls this route once a day with Authorization: Bearer <CRON_SECRET>.
@Controller('cron')
@AllowAnonymous()
export class SweepController {
  constructor(private readonly sweepService: SweepService) {}

  @Get('sweep')
  sweep(@Headers('authorization') authorization?: string): Promise<SweepResult> {
    const secret = process.env.CRON_SECRET;
    // Both sides are SHA-256 hashes, so timingSafeEqual gets two buffers of the same length.
    if (
      !secret ||
      !authorization ||
      !timingSafeEqual(sha256(authorization), sha256(`Bearer ${secret}`))
    ) {
      throw new ApiError(401, 'unauthorized', 'This request needs the cron secret.');
    }
    return this.sweepService.run();
  }
}
