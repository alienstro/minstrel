import { Logger } from '@nestjs/common';
import { VercelBackgroundWork } from './background-work.js';

describe('VercelBackgroundWork', () => {
  it('run passes the promise to waitUntil', async () => {
    const promises: Promise<unknown>[] = [];
    let ran = false;
    const work = new VercelBackgroundWork((p) => promises.push(p));
    work.run(async () => {
      ran = true;
    });
    expect(promises).toHaveLength(1);
    await promises[0];
    expect(ran).toBe(true);
  });

  it('a failed task is logged and does not throw', async () => {
    const promises: Promise<unknown>[] = [];
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const work = new VercelBackgroundWork((p) => promises.push(p));
    expect(() =>
      work.run(async () => {
        throw new Error('sync failed');
      }),
    ).not.toThrow();
    await expect(promises[0]).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledOnce();
  });
});
