import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { ConnectionDto, ModelOption } from '@minstrel/shared';
import { UserThrottlerGuard } from '../common/pg-throttler.storage.js';
import { UserId } from '../common/user-id.decorator.js';
import { ConnectionsService } from './connections.service.js';

const HOUR_MS = 3_600_000;

// Spec §9. The service checks each body with the shared schemas.
@Controller('connections')
export class ConnectionsController {
  constructor(private readonly connections: ConnectionsService) {}

  @Get()
  list(@UserId() userId: string): Promise<ConnectionDto[]> {
    return this.connections.list(userId);
  }

  @Post()
  create(
    @UserId() userId: string,
    @Body() body: unknown,
  ): Promise<ConnectionDto> {
    return this.connections.create(userId, body);
  }

  @Patch(':id')
  update(
    @UserId() userId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ConnectionDto> {
    return this.connections.update(userId, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @UserId() userId: string,
    @Param('id') id: string,
  ): Promise<void> {
    await this.connections.remove(userId, id);
  }

  // Spec §7.4: 30 connection tests for each user in an hour.
  @Post(':id/test')
  @HttpCode(200)
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: HOUR_MS } })
  test(
    @UserId() userId: string,
    @Param('id') id: string,
  ): Promise<ConnectionDto> {
    return this.connections.test(userId, id);
  }

  @Get(':id/models')
  models(
    @UserId() userId: string,
    @Param('id') id: string,
  ): Promise<ModelOption[]> {
    return this.connections.models(userId, id);
  }
}
