import {
  type BeforeApplicationShutdown,
  Global,
  Injectable,
  Logger,
  Module,
} from '@nestjs/common';

// Work that runs after the reply, for example a sync on read. Code never starts a bare promise for
// this work (plan Global Constraints).
export abstract class BackgroundWork {
  abstract run(task: () => Promise<void>): void;
}

// The API is a long-running Node server. On a deploy, Docker sends SIGTERM to the old container.
// Nest calls beforeApplicationShutdown on all modules before onApplicationShutdown closes the
// database pool, so the pending tasks can still use the database here.
@Injectable()
export class NodeBackgroundWork
  extends BackgroundWork
  implements BeforeApplicationShutdown
{
  private readonly logger = new Logger(BackgroundWork.name);
  private readonly pending = new Set<Promise<void>>();

  constructor(private readonly shutdownTimeoutMs = 10_000) {
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
      })
      .finally(() => this.pending.delete(promise));
    this.pending.add(promise);
  }

  async beforeApplicationShutdown(): Promise<void> {
    if (this.pending.size === 0) return;
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(true), this.shutdownTimeoutMs);
    });
    const done = Promise.all(this.pending).then(() => false);
    if (await Promise.race([done, timedOut])) {
      this.logger.warn(
        `Shutdown did not wait for ${this.pending.size} background task(s)`,
      );
    }
    clearTimeout(timer);
  }
}

@Global()
@Module({
  providers: [
    { provide: BackgroundWork, useFactory: () => new NodeBackgroundWork() },
  ],
  exports: [BackgroundWork],
})
export class BackgroundWorkModule {}
