import { BackgroundWork } from '../../src/common/background-work.js';

// Keeps the tasks in a queue, so that a test can check the reply first and run the work after.
export class FakeBackgroundWork extends BackgroundWork {
  readonly queue: Array<() => Promise<void>> = [];

  run(task: () => Promise<void>): void {
    this.queue.push(task);
  }

  async drain(): Promise<void> {
    while (this.queue.length > 0) await this.queue.shift()!();
  }
}
