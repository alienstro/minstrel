import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@minstrel/shared';
import { AppService } from './app.service.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth(): HealthResponse {
    return this.appService.getHealth();
  }
}
