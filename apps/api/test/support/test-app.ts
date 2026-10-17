import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { MAILER } from '../../src/auth/mailer.js';
import { FakeMailer } from './fake-mailer.js';
import { TEST_DATABASE_URL } from './test-db.js';

export const TEST_ORIGIN = 'http://localhost:3000';

export interface TestApp {
  app: INestApplication<App>;
  mailer: FakeMailer;
}

export async function createTestApp(): Promise<TestApp> {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.WEB_ORIGIN = TEST_ORIGIN;
  process.env.BETTER_AUTH_SECRET = 'test-secret-test-secret-test-secret-00';
  const mailer = new FakeMailer();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MAILER)
    .useValue(mailer)
    .compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>({ bodyParser: false });
  configureApp(app);
  await app.init();
  return { app, mailer };
}
