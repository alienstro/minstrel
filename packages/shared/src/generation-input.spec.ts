import { describe, expect, it } from 'vitest';
import { fallbackTitle, inputSchemaFor } from './generation-input.js';

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

  it('an empty idea fails', () => {
    expect(ok('kie', { idea: '' })).toBe(false);
    expect(ok('kie', { idea: '   ' })).toBe(false);
  });

  it('a song with lyrics needs no idea', () => {
    expect(ok('kie', { idea: undefined, lyrics: '[Verse] Rain on the roof' })).toBe(true);
  });

  it('an instrumental with a style needs no idea', () => {
    expect(ok('kie', { idea: undefined, instrumental: true, style: 'lo-fi' })).toBe(true);
  });

  it('a song with no idea, no lyrics, and no instrumental style fails on the idea', () => {
    const result = inputSchemaFor('kie').safeParse({ instrumental: true, model: 'V6', lyrics: '   ' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['idea']);
  });

  it('lyrics of an instrumental do not replace the idea', () => {
    expect(ok('kie', { idea: undefined, instrumental: true, lyrics: '[Verse] Rain' })).toBe(false);
  });
});

describe('fallbackTitle', () => {
  const input = { instrumental: false, model: 'V6' };

  it('uses the title first', () => {
    expect(fallbackTitle({ ...input, title: 'Rain', idea: 'A song about rain' })).toBe('Rain');
  });

  it('uses the start of the idea when there is no title', () => {
    expect(fallbackTitle({ ...input, idea: 'a'.repeat(100) })).toBe('a'.repeat(80));
  });

  it('uses the first sung line of the lyrics when there is no idea', () => {
    expect(fallbackTitle({ ...input, lyrics: '\n[Verse 1]\n  Rain on the roof  \nAnd on the road' })).toBe('Rain on the roof');
  });

  it('is Untitled when there is nothing to use', () => {
    expect(fallbackTitle({ ...input, instrumental: true, style: 'lo-fi' })).toBe('Untitled');
  });
});
