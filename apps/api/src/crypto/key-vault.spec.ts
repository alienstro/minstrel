import { randomBytes } from 'node:crypto';
import { KeyVault, parseKeyring } from './key-vault.js';

const k1 = randomBytes(32).toString('base64');
const k2 = randomBytes(32).toString('base64');
const AAD = 'user-1:conn-1';

describe('KeyVault', () => {
  it('encrypt then decrypt gives the key', () => {
    const vault = new KeyVault(parseKeyring(`1:${k1}`));
    expect(vault.decrypt(vault.encrypt('sk-live-abc', AAD), AAD)).toBe(
      'sk-live-abc',
    );
  });

  it('a different aad fails', () => {
    const vault = new KeyVault(parseKeyring(`1:${k1}`));
    const sealed = vault.encrypt('sk-live-abc', AAD);
    expect(() => vault.decrypt(sealed, 'user-2:conn-1')).toThrow();
  });

  it('encrypt uses the highest version', () => {
    const vault = new KeyVault(parseKeyring(`1:${k1},2:${k2}`));
    expect(vault.encrypt('sk', AAD).version).toBe(2);
  });

  it('decrypt uses the version of the row', () => {
    const old = new KeyVault(parseKeyring(`1:${k1}`)).encrypt('sk-old', AAD);
    const vault = new KeyVault(parseKeyring(`1:${k1},2:${k2}`));
    expect(vault.decrypt(old, AAD)).toBe('sk-old');
  });

  it('an unknown version throws', () => {
    const sealed = new KeyVault(parseKeyring(`2:${k2}`)).encrypt('sk', AAD);
    expect(() =>
      new KeyVault(parseKeyring(`1:${k1}`)).decrypt(sealed, AAD),
    ).toThrow(/version 2/);
  });

  it('two encryptions use different IVs', () => {
    const vault = new KeyVault(parseKeyring(`1:${k1}`));
    const a = vault.encrypt('sk', AAD);
    const b = vault.encrypt('sk', AAD);
    expect(a.iv).toHaveLength(12);
    expect(a.iv.equals(b.iv)).toBe(false);
  });

  it('parseKeyring rejects a key that is not 32 bytes', () => {
    expect(() =>
      parseKeyring(`1:${randomBytes(16).toString('base64')}`),
    ).toThrow(/32 bytes/);
    expect(() => parseKeyring('')).toThrow();
  });
});
