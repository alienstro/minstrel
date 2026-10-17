import { describe, expect, it } from 'vitest';
import { inputSchemaFor } from './generation-input.js';

const base = { idea: 'A song about rain', instrumental: false, model: 'V6' };

const ok = (adapter: Parameters<typeof inputSchemaFor>[0], extra: object) =>
  inputSchemaFor(adapter).safeParse({ ...base, ...extra }).success;

describe('inputSchemaFor', () => {
  it('kie accepts a title of 80 and rejects 81', () => {
    expect(ok('kie', { title: 'a'.repeat(80) })).toBe(true);
    expect(ok('kie', { title: 'a'.repeat(81) })).toBe(false);
  });

  it('kie rejects style 1001, lyrics 5001, and idea 3001', () => {
    expect(ok('kie', { style: 'a'.repeat(1000) })).toBe(true);
    expect(ok('kie', { style: 'a'.repeat(1001) })).toBe(false);
    expect(ok('kie', { lyrics: 'a'.repeat(5000) })).toBe(true);
    expect(ok('kie', { lyrics: 'a'.repeat(5001) })).toBe(false);
    expect(ok('kie', { idea: 'a'.repeat(3000) })).toBe(true);
    expect(ok('kie', { idea: 'a'.repeat(3001) })).toBe(false);
  });

  it('kie accepts length 10 and 360 and rejects 9 and 361', () => {
    expect(ok('kie', { lengthSeconds: 10 })).toBe(true);
    expect(ok('kie', { lengthSeconds: 360 })).toBe(true);
    expect(ok('kie', { lengthSeconds: 9 })).toBe(false);
    expect(ok('kie', { lengthSeconds: 361 })).toBe(false);
  });

  it('suno_classic uses the kie limits', () => {
    expect(ok('suno_classic', { title: 'a'.repeat(81) })).toBe(false);
    expect(ok('suno_classic', { lengthSeconds: 360 })).toBe(true);
    expect(ok('suno_classic', { lengthSeconds: 361 })).toBe(false);
  });

  it('elevenlabs accepts 5 and 180 and rejects 4 and 185', () => {
    expect(ok('elevenlabs', { lengthSeconds: 5 })).toBe(true);
    expect(ok('elevenlabs', { lengthSeconds: 180 })).toBe(true);
    expect(ok('elevenlabs', { lengthSeconds: 4 })).toBe(false);
    expect(ok('elevenlabs', { lengthSeconds: 185 })).toBe(false);
    expect(ok('elevenlabs', { lengthSeconds: 30.5 })).toBe(false);
  });

  it('an empty idea fails', () => {
    expect(ok('kie', { idea: '' })).toBe(false);
    expect(ok('kie', { idea: '   ' })).toBe(false);
  });
});
