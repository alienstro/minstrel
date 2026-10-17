import { mapProviderError } from './provider-error.js';

describe('mapProviderError', () => {
  it('401 gives invalid_key', () => {
    expect(mapProviderError(401, 'Unauthorized', 'kie.ai')).toMatchObject({
      code: 'invalid_key',
      message:
        'kie.ai did not accept this key. Check the key in Settings → Connections.',
    });
  });

  it('402 gives insufficient_credits', () => {
    expect(mapProviderError(402, '', 'kie.ai')).toMatchObject({
      code: 'insufficient_credits',
      message:
        'Your kie.ai account has no credits left. Add credits with kie.ai, then try again.',
    });
  });

  it('429 gives provider_rate_limited', () => {
    expect(mapProviderError(429, '', 'kie.ai')).toMatchObject({
      code: 'provider_rate_limited',
      message: 'kie.ai is busy. Wait a minute, then try again.',
    });
  });

  it('400 and 422 give provider_rejected with the reason', () => {
    for (const status of [400, 422]) {
      expect(
        mapProviderError(status, 'model V9 does not exist', 'kie.ai'),
      ).toMatchObject({
        code: 'provider_rejected',
        message: 'kie.ai did not accept this request: model V9 does not exist.',
      });
    }
  });

  it('500 and a timeout give provider_unavailable', () => {
    for (const status of [500, 503, 0]) {
      expect(mapProviderError(status, '', 'kie.ai')).toMatchObject({
        code: 'provider_unavailable',
        message: 'kie.ai did not answer. Try again in a few minutes.',
      });
    }
  });

  it('the message uses the connection label', () => {
    expect(mapProviderError(401, '', 'My sunoapi').message).toMatch(
      /^My sunoapi did not accept/,
    );
  });

  it('a long reason is cut and a key in it is hidden', () => {
    const error = mapProviderError(
      400,
      `bad header Bearer sk-live-123 ${'x'.repeat(500)}`,
      'kie.ai',
    );
    expect(error.message).not.toContain('sk-live-123');
    expect(error.message.length).toBeLessThan(260);
  });
});
