import {
  audioExt,
  normalizeAudioType,
  trackAudioKey,
  trackCoverKey,
} from './object-key.js';

describe('object keys', () => {
  it('audio/wav keeps its type and gets wav', () => {
    expect(normalizeAudioType('audio/wav')).toBe('audio/wav');
    expect(audioExt('audio/wav')).toBe('wav');
    expect(audioExt('audio/x-wav')).toBe('wav');
  });

  it('text/html becomes audio/mpeg and mp3', () => {
    expect(normalizeAudioType('text/html; charset=utf-8')).toBe('audio/mpeg');
    expect(normalizeAudioType(null)).toBe('audio/mpeg');
    expect(audioExt(normalizeAudioType('text/html'))).toBe('mp3');
  });

  it('audio/mp4 gets m4a and parameters go away', () => {
    expect(normalizeAudioType('Audio/MP4; codecs=mp4a')).toBe('audio/mp4');
    expect(audioExt('audio/mp4')).toBe('m4a');
  });

  it('the key is users/<userId>/tracks/<trackId>.mp3', () => {
    expect(trackAudioKey('u1', 't1', 'audio/mpeg')).toBe(
      'users/u1/tracks/t1.mp3',
    );
  });

  it('the cover key ends in .jpg', () => {
    expect(trackCoverKey('u1', 't1')).toBe('users/u1/tracks/t1.jpg');
  });
});
