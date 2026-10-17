import { Logger } from '@nestjs/common';
import { NodeBackgroundWork } from './background-work.js';

describe('NodeBackgroundWork', () => {
  it('runs the task after run() returns', async () => {
    let ran = false;
    const work = new NodeBackgroundWork();
    work.run(async () => {
      ran = true;
    });
    expect(ran).toBe(false);
    await work.beforeApplicationShutdown();
    expect(ran).toBe(true);
  });

  it('logs a failed task and does not throw', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const work = new NodeBackgroundWork();
    expect(() =>
      work.run(async () => {
        throw new Error('sync failed');
      }),
    ).not.toThrow();
    await expect(work.beforeApplicationShutdown()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledOnce();
  });

  it('beforeApplicationShutdown waits for a pending task', async () => {
    let finished = false;
    const work = new NodeBackgroundWork();
    work.run(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      finished = true;
    });
    await work.beforeApplicationShutdown();
    expect(finished).toBe(true);
  });

  it('beforeApplicationShutdown stops waiting after the timeout', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const work = new NodeBackgroundWork(10);
    work.run(() => new Promise<void>(() => undefined));
    const started = Date.now();
    await work.beforeApplicationShutdown();
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(warn).toHaveBeenCalledOnce();
  });
});
