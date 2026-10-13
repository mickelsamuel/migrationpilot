import { describe, it, expect } from 'vitest';
import { createPublicKey } from 'node:crypto';
import { CURRENT_KEY_VERSION, PUBLIC_KEYS } from '../src/license/public-keys.js';

// The public keys the CLI ships with, unmocked. Version 1's private key was
// committed to this repository's tests, so a CLI that still trusted version 1
// would accept a key anyone could sign.
const RETIRED_V1_PUBLIC_KEY = 'MCowBQYDK2VwAyEAcDLU0la74O2PoN2oN9kJ+R9ytt8SsygL3nAqW8n7sbg=';

describe('shipped license public keys', () => {
  it('trusts only version 2, and signs new keys with it', () => {
    expect(Object.keys(PUBLIC_KEYS)).toEqual(['2']);
    expect(CURRENT_KEY_VERSION).toBe('2');
  });

  it('no longer carries the retired version 1 key under any version', () => {
    for (const pem of Object.values(PUBLIC_KEYS)) {
      expect(pem).not.toContain(RETIRED_V1_PUBLIC_KEY);
    }
  });

  it('carries keys node can load as Ed25519', () => {
    for (const pem of Object.values(PUBLIC_KEYS)) {
      expect(createPublicKey(pem).asymmetricKeyType).toBe('ed25519');
    }
  });
});
