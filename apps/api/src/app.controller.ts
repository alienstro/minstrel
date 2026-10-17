import { Controller, Get } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import type { HealthResponse } from '@minstrel/shared';
import { AppService } from './app.service.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  @AllowAnonymous()
  getHealth(): HealthResponse {
    return this.appService.getHealth();
  }
}
