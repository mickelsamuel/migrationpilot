/**
 * SSO authentication for MigrationPilot Enterprise.
 *
 * Provides device code flow for CLI authentication:
 * 1. User runs `migrationpilot login`
 * 2. CLI generates a device code and shows a URL
 * 3. User opens URL in browser and authenticates via SSO
 * 4. CLI polls for completion and stores the auth token
 *
 * Supports:
 * - SAML 2.0 (via WorkOS)
 * - OIDC (via WorkOS)
 * - Email/password fallback
 *
 * Token is stored in ~/.migrationpilot/auth.json
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir, hostname } from 'node:os';
import { randomBytes, createCipheriv, createDecipheriv, scryptSync, createHash } from 'node:crypto';

const AUTH_DIR = join(homedir(), '.migrationpilot');
const AUTH_FILE = join(AUTH_DIR, 'auth.json');

/** Derive an encryption key from machine-specific characteristics. */
function deriveEncryptionKey(): Buffer {
  const machineId = createHash('sha256').update(`${hostname()}:${homedir()}`).digest('hex');
  return scryptSync(machineId, 'migrationpilot-auth-v1', 32);
}

/** Encrypt a string using AES-256-GCM with a machine-derived key. */
function encryptToken(plaintext: string): string {
  const key = deriveEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/** Decrypt an encrypted token string. Returns null if decryption fails. */
function decryptToken(ciphertext: string): string | null {
  try {
    if (!ciphertext.startsWith('v1:')) {
      // Legacy unencrypted format — read as-is for migration
      return ciphertext;
    }
    const parts = ciphertext.split(':');
    if (parts.length !== 4) return null;
    const key = deriveEncryptionKey();
    const iv = Buffer.from(parts[1]!, 'hex');
    const tag = Buffer.from(parts[2]!, 'hex');
    const encrypted = Buffer.from(parts[3]!, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf-8');
  } catch {
    return null;
  }
}

export interface AuthToken {
  /** Access token for API requests */
  accessToken: string;
  /** Token expiry timestamp */
  expiresAt: string;
  /** User email */
  email: string;
  /** Organization ID */
  orgId?: string;
  /** Organization name */
  orgName?: string;
  /** Authentication method used */
  method: 'sso' | 'email' | 'api-key';
}

export interface DeviceCodeResponse {
  /** The device code for polling */
  deviceCode: string;
  /** The code the user enters in the browser */
  userCode: string;
  /** The URL the user should visit */
  verificationUrl: string;
  /** How often to poll (seconds) */
  interval: number;
  /** When the code expires */
  expiresAt: string;
}

export interface SSOConfig {
  /** MigrationPilot API base URL */
  apiUrl?: string;
  /** WorkOS client ID (set by org admin) */
  clientId?: string;
  /** Organization connection ID for SSO */
  connectionId?: string;
}

const DEFAULT_API_URL = 'https://api.migrationpilot.dev';

/**
 * Read the stored auth token.
 * Returns null if not authenticated or token is expired.
 */
export async function getAuthToken(): Promise<AuthToken | null> {
  try {
    const raw = await readFile(AUTH_FILE, 'utf-8');
    const decrypted = decryptToken(raw.trim());
    if (!decrypted) return null;

    const token = JSON.parse(decrypted) as AuthToken;

    // Check expiry
    if (new Date(token.expiresAt) < new Date()) {
      return null;
    }

    return token;
  } catch {
    return null;
  }
}

/**
 * Store an auth token to disk.
 */
export async function saveAuthToken(token: AuthToken): Promise<void> {
  await mkdir(AUTH_DIR, { recursive: true });
  const encrypted = encryptToken(JSON.stringify(token));
  await writeFile(AUTH_FILE, encrypted, { mode: 0o600 });
}

/**
 * Remove the stored auth token (logout).
 */
export async function clearAuthToken(): Promise<void> {
  try {
    const { unlink } = await import('node:fs/promises');
    await unlink(AUTH_FILE);
  } catch {
    // Already cleared
  }
}

/**
 * Generate a device code for the login flow.
 * In production, this calls the MigrationPilot API.
 */
export function generateDeviceCode(): DeviceCodeResponse {
  const deviceCode = randomBytes(32).toString('hex');
  const userCode = randomBytes(4).toString('hex').toUpperCase().slice(0, 8);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes

  return {
    deviceCode,
    userCode: `${userCode.slice(0, 4)}-${userCode.slice(4)}`,
    verificationUrl: `${DEFAULT_API_URL}/auth/device`,
    interval: 5,
    expiresAt,
  };
}

/**
 * Initiate the device code flow against the MigrationPilot API.
 * Returns the device code response for the user to authenticate.
 */
export async function initiateDeviceFlow(config?: SSOConfig): Promise<DeviceCodeResponse> {
  const apiUrl = config?.apiUrl || DEFAULT_API_URL;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(`${apiUrl}/auth/device/code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'MigrationPilot-CLI/1.4.0',
      },
      body: JSON.stringify({
        clientId: config?.clientId,
        connectionId: config?.connectionId,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Auth server returned ${response.status}`);
    }

    return await response.json() as DeviceCodeResponse;
  } catch {
    // Fallback to local device code generation for offline/testing
    return generateDeviceCode();
  }
}

/**
 * Poll the API for device code completion.
 * Returns the auth token when the user completes authentication.
 */
export async function pollDeviceCode(
  deviceCode: string,
  config?: SSOConfig,
): Promise<AuthToken | null> {
  const apiUrl = config?.apiUrl || DEFAULT_API_URL;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(`${apiUrl}/auth/device/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'MigrationPilot-CLI/1.4.0',
      },
      body: JSON.stringify({ deviceCode }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.status === 202) {
      // Authorization pending — user hasn't completed auth yet
      return null;
    }

    if (!response.ok) {
      return null;
    }

    return await response.json() as AuthToken;
  } catch {
    return null;
  }
}

/**
 * Validate an API key for non-SSO authentication.
 */
export async function validateApiKey(
  apiKey: string,
  config?: SSOConfig,
): Promise<AuthToken | null> {
  const apiUrl = config?.apiUrl || DEFAULT_API_URL;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(`${apiUrl}/auth/validate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'MigrationPilot-CLI/1.4.0',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) return null;
    return await response.json() as AuthToken;
  } catch {
    return null;
  }
}

/**
 * Check if the user is currently authenticated.
 */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getAuthToken();
  return token !== null;
}

/**
 * Get the current user's organization info from the stored token.
 */
export async function getOrgInfo(): Promise<{ orgId?: string; orgName?: string; email: string } | null> {
  const token = await getAuthToken();
  if (!token) return null;

  return {
    orgId: token.orgId,
    orgName: token.orgName,
    email: token.email,
  };
}
