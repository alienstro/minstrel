import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { MAILER } from '../../src/auth/mailer.js';
import { BackgroundWork } from '../../src/common/background-work.js';
import {
  MUSIC_PROVIDERS,
  TEXT_PROVIDER,
} from '../../src/providers/registry.js';
import type { MusicProvider, TextProvider } from '../../src/providers/types.js';
import { SAFE_FETCH, type SafeFetch } from '../../src/net/safe-fetch.js';
import { AUDIO_STORE } from '../../src/storage/audio-store.js';
import { FakeAudioStore } from './fake-audio-store.js';
import { FakeBackgroundWork } from './fake-background-work.js';
import { FakeMailer } from './fake-mailer.js';
import { fakeMusicProviders, fakeTextProvider } from './fake-providers.js';
import { TEST_DATABASE_URL } from './test-db.js';

export const TEST_ORIGIN = 'http://localhost:3000';
export const TEST_KEY_ENCRYPTION_KEYS = `1:${Buffer.alloc(32, 7).toString('base64')}`;

export interface TestApp {
  app: INestApplication<App>;
  mailer: FakeMailer;
  background: FakeBackgroundWork;
  audioStore: FakeAudioStore;
}

export interface TestAppOptions {
  /** Test-only routes, for example a probe route for a guard test. */
  controllers?: Type[];
  /** The fake providers replace the real ones, so no test calls a provider. */
  musicProviders?: MusicProvider[];
  textProvider?: TextProvider;
  /** The outbound fetch for audio downloads. The default throws, so no test calls the network. */
  safeFetch?: SafeFetch;
}

const noNetwork: SafeFetch = async (url) => {
  throw new Error(`The test made an unexpected fetch to ${url}`);
};

export async function createTestApp(
  options: TestAppOptions = {},
): Promise<TestApp> {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.LOG_LEVEL ??= 'silent';
  process.env.WEB_ORIGIN = TEST_ORIGIN;
  process.env.BETTER_AUTH_SECRET = 'test-secret-test-secret-test-secret-00';
  process.env.KEY_ENCRYPTION_KEYS = TEST_KEY_ENCRYPTION_KEYS;
process.env.R2_ACCOUNT_ID ??= 'test-account';
process.env.R2_ACCESS_KEY_ID ??= 'test-id';
process.env.R2_SECRET_ACCESS_KEY ??= 'test-secret';
process.env.R2_BUCKET ??= 'test-bucket';
  const mailer = new FakeMailer();
  const background = new FakeBackgroundWork();
  const audioStore = new FakeAudioStore();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: options.controllers ?? [],
  })
    .overrideProvider(MAILER)
    .useValue(mailer)
    .overrideProvider(BackgroundWork)
    .useValue(background)
    .overrideProvider(MUSIC_PROVIDERS)
    .useValue(options.musicProviders ?? fakeMusicProviders())
    .overrideProvider(TEXT_PROVIDER)
    .useValue(options.textProvider ?? fakeTextProvider())
    .overrideProvider(AUDIO_STORE)
    .useValue(audioStore)
    .overrideProvider(SAFE_FETCH)
    .useValue(options.safeFetch ?? noNetwork)
    .compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>({
    bodyParser: false,
  });
  configureApp(app);
  await app.init();
  return { app, mailer, background, audioStore };
}
