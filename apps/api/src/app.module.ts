import type { IncomingMessage } from 'node:http';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { BackgroundWorkModule } from './common/background-work.js';
import { loggerOptions } from './common/logger.js';
import { OriginGuard } from './common/origin.guard.js';
import { PgThrottlerStorage } from './common/pg-throttler.storage.js';
import { authEnvFromProcess, createAuth } from './auth/auth.js';
import { MAILER, ResendMailer, type Mailer } from './auth/mailer.js';
import { AssistController } from './assist/assist.controller.js';
import { AssistService } from './assist/assist.service.js';
import { ConnectionsModule } from './connections/connections.module.js';
import { DB, DbModule, type Db } from './db/db.module.js';
import { GenerationsModule } from './generations/generations.module.js';
import { ProvidersModule } from './providers/providers.module.js';
import { AUDIO_STORE, type AudioStore } from './storage/audio-store.js';
import { StorageModule } from './storage/storage.module.js';
import { TracksModule } from './tracks/tracks.module.js';

const mailerProvider = {
  provide: MAILER,
  useFactory: (): Mailer =>
    new ResendMailer(
      process.env.RESEND_API_KEY ?? '',
      process.env.EMAIL_FROM ?? '',
    ),
};

// The webhook route ignores its body (spec §5.3), so the parsers skip it. A bad or large provider
// body then cannot turn a good callback into a 400 or a 413.
function parseUnlessWebhook(mediaType: string) {
  return (req: IncomingMessage & { originalUrl?: string }): boolean => {
    // Express middleware can strip its mount path from req.url. originalUrl keeps the full path.
    if ((req.originalUrl ?? req.url ?? '').startsWith('/api/webhooks/')) return false;
    const type = (req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
    return type === mediaType;
  };
}

@Module({
  providers: [mailerProvider],
  exports: [MAILER],
})
class MailerModule {}

@Module({
  imports: [
    // process.stdout as the stream, so that a test can read the log lines.
    LoggerModule.forRoot({ pinoHttp: [loggerOptions(), process.stdout] }),
    DbModule,
    BackgroundWorkModule,
    ProvidersModule,
    StorageModule,
    ConnectionsModule,
    GenerationsModule,
    TracksModule,
    // Each limited route sets its own limit with @Throttle (spec §7.4). The default is only a fallback.
    ThrottlerModule.forRootAsync({
      inject: [DB],
      useFactory: (db: Db) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 60 }],
        storage: new PgThrottlerStorage(db),
      }),
    }),
    // The module registers a global guard: each route needs a session unless it has @AllowAnonymous.
    AuthModule.forRootAsync({
      imports: [MailerModule],
      inject: [DB, MAILER, AUDIO_STORE],
      useFactory: (db: Db, mailer: Mailer, audio: AudioStore) => ({
        auth: createAuth(db, authEnvFromProcess(), mailer, audio),
        bodyParser: {
          json: { type: parseUnlessWebhook('application/json') },
          urlencoded: { type: parseUnlessWebhook('application/x-www-form-urlencoded') },
        },
      }),
    }),
  ],
  controllers: [AppController, AssistController],
  providers: [
    AppService,
    AssistService,
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_GUARD, useClass: OriginGuard },
  ],
})
export class AppModule {}
