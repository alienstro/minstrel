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
import { ConnectionsModule } from './connections/connections.module.js';
import { DB, DbModule, type Db } from './db/db.module.js';
import { ProvidersModule } from './providers/registry.js';

const mailerProvider = {
  provide: MAILER,
  useFactory: (): Mailer =>
    new ResendMailer(
      process.env.RESEND_API_KEY ?? '',
      process.env.EMAIL_FROM ?? '',
    ),
};

@Module({
  providers: [mailerProvider],
  exports: [MAILER],
})
class MailerModule {}

@Module({
  imports: [
    LoggerModule.forRoot({ pinoHttp: loggerOptions() }),
    DbModule,
    BackgroundWorkModule,
    ProvidersModule,
    ConnectionsModule,
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
      inject: [DB, MAILER],
      useFactory: (db: Db, mailer: Mailer) => ({
        auth: createAuth(db, authEnvFromProcess(), mailer),
      }),
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_GUARD, useClass: OriginGuard },
  ],
})
export class AppModule {}
