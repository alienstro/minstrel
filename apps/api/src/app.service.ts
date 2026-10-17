import { Injectable } from '@nestjs/common';
import type { HealthResponse } from '@minstrel/shared';

@Injectable()
export class AppService {
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      service: 'api',
      timestamp: new Date().toISOString(),
    };
  }
}
