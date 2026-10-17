import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';

async function bootstrap() {
  // Better Auth reads the raw body of auth routes. The auth module adds the JSON parser for the other routes.
  // No CORS: the browser reaches the API on the same origin (spec §2.2).
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  configureApp(app);
  await app.listen(process.env.PORT ?? 4000);
}
// No top-level await. Vercel imports this file and replaces listen() with a stub that never
// calls back, so an await here keeps the import open until the function times out.
// A failed start is an unhandled rejection, which stops Node with the error.
void bootstrap();
