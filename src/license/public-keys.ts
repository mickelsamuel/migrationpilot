/**
 * Ed25519 public keys that verify license keys, by key version.
 *
 * Publishing these is safe: a public key checks a signature, it cannot make one.
 * The private half of each lives only in the signing server's environment.
 *
 * Version 1 is retired. Its private key was committed to this repository's
 * tests, so anyone could sign with it; keys that name no version, or version 1,
 * are refused.
 *
 * Rotation: generate a new pair, add its public half here under the next
 * version, set CURRENT_KEY_VERSION, ship, then give the server the new private key.
 */
export const PUBLIC_KEYS: Readonly<Record<string, string>> = {
  '2': `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAYp2vciU9xNay9GjlSk85FlBAPgpDiXnGKOWge7Wt/jA=
-----END PUBLIC KEY-----`,
};

/** The version new keys are signed with. */
export const CURRENT_KEY_VERSION = '2';
