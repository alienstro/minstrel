import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';

async function bootstrap() {
  // Better Auth reads the raw body of auth routes. The auth module adds the JSON parser for the other routes.
  // No CORS: the browser reaches the API on the same origin (spec §2.2).
  const app = await NestFactory.create(AppModule, { bodyParser: false, bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app);
  await app.listen(process.env.PORT ?? 4000);
}
await bootstrap();
