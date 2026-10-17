import { isFakeMode } from './fake-mode.js';

describe('isFakeMode', () => {
  it('is off without the flag', () => {
    expect(isFakeMode({})).toBe(false);
    expect(isFakeMode({ MINSTREL_FAKE_PROVIDERS: '0' })).toBe(false);
  });

  it('is on with the flag outside production', () => {
    expect(isFakeMode({ MINSTREL_FAKE_PROVIDERS: '1' })).toBe(true);
    expect(isFakeMode({ MINSTREL_FAKE_PROVIDERS: '1', NODE_ENV: 'development' })).toBe(true);
  });

  it('refuses to start with the flag in production', () => {
    expect(() => isFakeMode({ MINSTREL_FAKE_PROVIDERS: '1', NODE_ENV: 'production' })).toThrow(
      /MINSTREL_FAKE_PROVIDERS/,
    );
  });
});
