import { isBlockedAddress } from './ip-policy.js';

describe('isBlockedAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '::1',
    'fd00::1',
    '::ffff:10.0.0.1',
  ])('blocks %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each([
    '0.0.0.0',
    '::',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:a9fe:a9fe',
    '64:ff9b::a00:5',
    'not-an-ip',
  ])('also blocks %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each([
    '::a00:5', // IPv4-compatible
    '::ffff:0:a00:5', // SIIT
    '64:ff9b:1::a00:5', // local-use NAT64
    '2001::1', // Teredo
    '2001:db8::1', // documentation
    '100::1', // discard
    'fe80::1%eth0', // zone ID
    '2606:4700::1111%1',
  ])('blocks the IPv6 special form %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '2606:4700::1111', '2a00:1450:4001::200e'])('allows %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });
});
