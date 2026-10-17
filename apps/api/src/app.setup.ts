import type { INestApplication } from '@nestjs/common';

// Shared by main.ts and the e2e tests, so that both run the same app.
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
}
