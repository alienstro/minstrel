import { Controller, Get } from '@nestjs/common';
import type { ProviderInfo } from '@minstrel/shared';
import { ProviderRegistry } from './registry.js';

@Controller('providers')
export class ProvidersController {
  constructor(private readonly registry: ProviderRegistry) {}

  @Get()
  list(): ProviderInfo[] {
    return this.registry.list();
  }
}
