'use client';

/**
 * Shareable permalinks for the playground.
 *
 * The migration is deflate-compressed and base64url'd into the URL fragment,
 * which browsers never send to a server — so a shared link keeps the same
 * promise as the page itself: the SQL stays on the client.
 *
 * Format: #z=<deflate-raw,base64url>&pg=<major>
 *         #u=<utf8,base64url>&pg=<major>   (browsers without CompressionStream)
 */

export interface SharedState {
  sql: string;
  pgVersion: number;
}

/** Anything longer than this makes for a link no one can paste. */
const MAX_ENCODED_CHARS = 8_000;

export async function encodeShare(sql: string, pgVersion: number): Promise<string | null> {
  const bytes = new TextEncoder().encode(sql);
  const packed = await deflate(bytes);
  const hash = packed
    ? `#z=${toBase64Url(packed)}&pg=${pgVersion}`
    : `#u=${toBase64Url(bytes)}&pg=${pgVersion}`;
  return hash.length > MAX_ENCODED_CHARS ? null : hash;
}

export async function decodeShare(hash: string): Promise<SharedState | null> {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const compressed = params.get('z');
  const plain = params.get('u');
  const payload = compressed ?? plain;
  if (!payload) return null;

  try {
    const bytes = fromBase64Url(payload);
    const raw = compressed ? await inflate(bytes) : bytes;
    if (!raw) return null;

    const pgVersion = Number(params.get('pg'));
    return {
      sql: new TextDecoder().decode(raw),
      pgVersion: Number.isInteger(pgVersion) ? pgVersion : 17,
    };
  } catch {
    return null;
  }
}

async function deflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer> | null> {
  if (typeof CompressionStream === 'undefined') return null;
  const stream = new Response(bytes).body?.pipeThrough(new CompressionStream('deflate-raw'));
  if (!stream) return null;
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer> | null> {
  if (typeof DecompressionStream === 'undefined') return null;
  const stream = new Response(bytes).body?.pipeThrough(new DecompressionStream('deflate-raw'));
  if (!stream) return null;
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
