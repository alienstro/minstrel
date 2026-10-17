import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { authEnvFromProcess, createAuth } from './auth/auth.js';
import { MAILER, ResendMailer, type Mailer } from './auth/mailer.js';
import { DB, DbModule, type Db } from './db/db.module.js';

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
    DbModule,
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
  ],
})
export class AppModule {}
