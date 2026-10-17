import { z, ZodError } from 'zod';
import { ZodBodyPipe } from './zod-body.pipe.js';

describe('ZodBodyPipe', () => {
  const pipe = new ZodBodyPipe(z.object({ label: z.string().trim().min(1) }));

  it('a valid body passes through parsed', () => {
    expect(pipe.transform({ label: '  kie.ai  ', extra: 1 })).toEqual({ label: 'kie.ai' });
  });

  it('an invalid body throws a ZodError', () => {
    expect(() => pipe.transform({ label: '' })).toThrow(ZodError);
  });
});
