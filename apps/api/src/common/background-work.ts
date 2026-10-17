import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { waitUntil } from '@vercel/functions';

// Work that runs after the reply, for example a sync on read. Vercel keeps the instance alive until
// the promise ends. Code never starts a bare promise for this work (plan Global Constraints).
export abstract class BackgroundWork {
  abstract run(task: () => Promise<void>): void;
}

@Injectable()
export class VercelBackgroundWork extends BackgroundWork {
  private readonly logger = new Logger(BackgroundWork.name);

  constructor(
    private readonly keepAlive: (promise: Promise<unknown>) => void = waitUntil,
  ) {
    super();
  }

  run(task: () => Promise<void>): void {
    const promise = Promise.resolve()
      .then(task)
      .catch((error: unknown) => {
        this.logger.error(
          'Background work failed',
          error instanceof Error ? error.stack : error,
        );
      });
    this.keepAlive(promise);
  }
}

@Global()
@Module({
  providers: [
    { provide: BackgroundWork, useFactory: () => new VercelBackgroundWork() },
  ],
  exports: [BackgroundWork],
})
export class BackgroundWorkModule {}
