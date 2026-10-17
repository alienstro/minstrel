import type { INestApplication, Type } from '@nestjs/common';
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

// `controllers` adds test-only routes, for example a probe route for a guard test.
export async function createTestApp(
  controllers: Type[] = [],
): Promise<TestApp> {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.LOG_LEVEL ??= 'silent';
  process.env.WEB_ORIGIN = TEST_ORIGIN;
  process.env.BETTER_AUTH_SECRET = 'test-secret-test-secret-test-secret-00';
  const mailer = new FakeMailer();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers,
  })
    .overrideProvider(MAILER)
    .useValue(mailer)
    .compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>({
    bodyParser: false,
  });
  configureApp(app);
  await app.init();
  return { app, mailer };
}
