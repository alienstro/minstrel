import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Query,
  Redirect,
} from '@nestjs/common';
import {
  renameTrackBodySchema,
  type Page,
  type RenameTrackBody,
  type TrackDto,
} from '@minstrel/shared';
import { UserId } from '../common/user-id.decorator.js';
import { ZodBodyPipe } from '../common/zod-body.pipe.js';
import { TracksService } from './tracks.service.js';

// A signed URL lasts 15 minutes, so no cache keeps the redirect.
const NO_STORE = ['Cache-Control', 'no-store'] as const;

@Controller('tracks')
export class TracksController {
  constructor(private readonly tracksService: TracksService) {}

  @Get()
  list(@UserId() userId: string, @Query('cursor') cursor?: string): Promise<Page<TrackDto>> {
    return this.tracksService.list(userId, cursor);
  }

  @Patch(':id')
  rename(
    @UserId() userId: string,
    @Param('id') id: string,
    @Body(new ZodBodyPipe(renameTrackBodySchema)) body: RenameTrackBody,
  ): Promise<TrackDto> {
    return this.tracksService.rename(userId, id, body.title);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@UserId() userId: string, @Param('id') id: string): Promise<void> {
    await this.tracksService.remove(userId, id);
  }

  @Get(':id/stream')
  @Redirect()
  @Header(...NO_STORE)
  async stream(@UserId() userId: string, @Param('id') id: string) {
    return { url: await this.tracksService.streamUrl(userId, id), statusCode: 302 };
  }

  @Get(':id/download')
  @Redirect()
  @Header(...NO_STORE)
  async download(@UserId() userId: string, @Param('id') id: string) {
    return {
      url: await this.tracksService.streamUrl(userId, id, { download: true }),
      statusCode: 302,
    };
  }
}
