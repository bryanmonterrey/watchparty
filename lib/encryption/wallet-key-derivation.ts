'use client';

/**
 * Wallet-rooted message key wrapping.
 *
 * The messaging identity (an ECDH P-256 private key) must never reach the
 * server in plaintext, otherwise the server could read every DM and there is no
 * real end-to-end encryption. Instead we encrypt it on-device with a key
 * derived from the user's FROST *client share* (d2) — the half of their MPC
 * wallet key that lives only on their device. The server holds the other half
 * plus an encrypted backup of d2 it can't open, so it can never reconstruct
 * this wrapping key and therefore can't decrypt the stored messaging key.
 *
 * Properties:
 * - No prompt / signature: d2 is already in IndexedDB once the wallet exists.
 * - Cross-device: d2 is restored on new devices via the wallet's own recovery,
 *   so the same wrapping key — and thus message history — follows the user.
 * - Server-blind: the server only ever stores `wrapPrivateKey()` output.
 *
 * Changing SALT/INFO invalidates every wrapped key (history becomes unreadable),
 * so treat them as a permanent version tag.
 */

import { getFrostClientData } from '@/lib/frost/frost-storage';

const SALT = new TextEncoder().encode('watchparty:messaging-e2e:v1');
const INFO = new TextEncoder().encode('message-private-key-wrapping');

/** Marks a stored private key as wrapped (vs. a legacy plaintext value). */
const WRAP_PREFIX = 'v2:';

/**
 * Fixed message signed by external (extension) wallets to derive their wrapping
 * key. ed25519 signatures are deterministic, so signing this exact string always
 * yields the same bytes — and thus the same key — on every device. Changing it
 * invalidates existing wrapped keys, so treat it as a permanent version tag.
 */
const SIGNING_MESSAGE =
  'Watchparty Encrypted Messaging\n\n' +
  'Sign to unlock your end-to-end encrypted messages on this device.\n\n' +
  'This request is free, will not submit a transaction, and reveals nothing to anyone.';

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function toArrayBuffer(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}

/** HKDF a 32-byte secret into the AES-GCM wrapping key (shared by both wallet types). */
async function hkdfWrapKey(secret: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(secret),
    'HKDF',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: SALT, info: INFO },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Embedded (MPC) wallet path: derive the wrapping key from the on-device FROST
 * client share. No prompt — it's already in IndexedDB. Returns null when no
 * share exists (the user is on an external wallet or has no wallet).
 */
export async function deriveMessagingWrapKey(userId: string): Promise<CryptoKey | null> {
  const frost = await getFrostClientData(userId);
  const signingShare = frost?.clientShare?.signingShare;
  if (!signingShare) return null;
  return hkdfWrapKey(base64ToBytes(signingShare));
}

/**
 * External (extension) wallet path: derive the wrapping key from a deterministic
 * signature. Prompts the wallet once; callers cache the resulting messaging key
 * locally so this only happens on first use per device.
 */
export async function deriveWrapKeyFromSignature(
  signMessage: (message: Uint8Array) => Promise<Uint8Array>,
): Promise<CryptoKey> {
  const signature = await signMessage(new TextEncoder().encode(SIGNING_MESSAGE));
  return hkdfWrapKey(signature);
}

/** True if the user has an embedded wallet share on this device. */
export async function hasWalletShare(userId: string): Promise<boolean> {
  return (await deriveMessagingWrapKey(userId)) !== null;
}

/** True if a stored private-key value is wrapped (encrypted), not legacy plaintext. */
export function isWrapped(storedPrivateKey: string): boolean {
  return storedPrivateKey.startsWith(WRAP_PREFIX);
}

/** Encrypts a plaintext private key for upload. Output: `v2:<ivB64>.<ciphertextB64>`. */
export async function wrapPrivateKey(wrapKey: CryptoKey, plaintextPrivateKey: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    wrapKey,
    toArrayBuffer(new TextEncoder().encode(plaintextPrivateKey)),
  );
  return `${WRAP_PREFIX}${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ciphertext))}`;
}

/**
 * Decrypts a wrapped private key. Returns null if the value is malformed or the
 * wrap key doesn't match (e.g. a different/rotated wallet share) — the caller
 * should surface that as "couldn't unlock messages on this device".
 */
export async function unwrapPrivateKey(wrapKey: CryptoKey, stored: string): Promise<string | null> {
  if (!isWrapped(stored)) return null;
  try {
    const [ivB64, ctB64] = stored.slice(WRAP_PREFIX.length).split('.');
    if (!ivB64 || !ctB64) return null;
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(base64ToBytes(ivB64)) },
      wrapKey,
      toArrayBuffer(base64ToBytes(ctB64)),
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}
