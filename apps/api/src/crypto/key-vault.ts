import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// Spec §7.1. AES-256-GCM with a 12-byte random IV. The AAD "<userId>:<connectionId>" ties each
// ciphertext to its row, so a ciphertext copied into another row does not decrypt.

export interface Sealed {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
  version: number;
}

// KEY_ENCRYPTION_KEYS: "1:<base64 32 bytes>,2:<base64 32 bytes>".
export function parseKeyring(env: string): Map<number, Buffer> {
  const keyring = new Map<number, Buffer>();
  for (const entry of env
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)) {
    const [versionText, base64] = entry.split(':');
    const version = Number(versionText);
    if (
      !Number.isInteger(version) ||
      version < 1 ||
      version > 32767 ||
      !base64
    ) {
      throw new Error(
        'KEY_ENCRYPTION_KEYS has an entry that is not "<version>:<base64 key>"',
      );
    }
    const key = Buffer.from(base64, 'base64');
    if (key.length !== 32)
      throw new Error(`KEY_ENCRYPTION_KEYS version ${version} is not 32 bytes`);
    if (keyring.has(version))
      throw new Error(`KEY_ENCRYPTION_KEYS has version ${version} two times`);
    keyring.set(version, key);
  }
  if (keyring.size === 0) throw new Error('KEY_ENCRYPTION_KEYS has no key');
  return keyring;
}

export class KeyVault {
  readonly currentVersion: number;

  constructor(private readonly keyring: Map<number, Buffer>) {
    this.currentVersion = Math.max(...keyring.keys());
  }

  encrypt(plain: string, aad: string): Sealed {
    const iv = randomBytes(12);
    const cipher = createCipheriv(
      'aes-256-gcm',
      this.key(this.currentVersion),
      iv,
    );
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ciphertext = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ]);
    return {
      ciphertext,
      iv,
      tag: cipher.getAuthTag(),
      version: this.currentVersion,
    };
  }

  decrypt(sealed: Sealed, aad: string): string {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key(sealed.version),
      sealed.iv,
      { authTagLength: 16 },
    );
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(sealed.tag);
    return Buffer.concat([
      decipher.update(sealed.ciphertext),
      decipher.final(),
    ]).toString('utf8');
  }

  private key(version: number): Buffer {
    const key = this.keyring.get(version);
    if (!key)
      throw new Error(`KEY_ENCRYPTION_KEYS has no key for version ${version}`);
    return key;
  }
}
