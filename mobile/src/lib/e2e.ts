// E2E message crypto — byte-compatible port of lib/encryption/crypto-manager.ts
// (web). Scheme: ECDH P-256 → AES-GCM-256, 12-byte IV, base64 wire format.
// WebCrypto's ECDH→AES-GCM deriveKey uses the raw shared-point x-coordinate
// as the AES key (no KDF), so we do exactly that with @noble. Keys are
// cloud-synced (encryption.getKeyPair/uploadKeyPair): public = raw SEC1
// uncompressed (65B) base64, private = PKCS8 base64 — same formats WebCrypto
// exports, so web and mobile share one identity.

import * as Crypto from 'expo-crypto';
import { gcm } from '@noble/ciphers/aes.js';
import { p256 } from '@noble/curves/nist.js';

// @noble needs crypto.getRandomValues; Hermes doesn't provide it.
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.getRandomValues) {
  (globalThis as Record<string, unknown>).crypto = {
    getRandomValues: (arr: Uint8Array) => Crypto.getRandomValues(arr),
  };
}

// ─── base64 (no atob/btoa dependency) ────────────────────────────────────────

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP: Record<string, number> = {};
for (let i = 0; i < B64.length; i++) B64_LOOKUP[B64[i]] = i;

export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 === undefined ? 0 : b1 >> 4)];
    out += b1 === undefined ? '=' : B64[((b1 & 15) << 2) | (b2 === undefined ? 0 : b2 >> 6)];
    out += b2 === undefined ? '=' : B64[b2 & 63];
  }
  return out;
}

export function fromBase64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i + 1 < clean.length; i += 4) {
    const n =
      (B64_LOOKUP[clean[i]] << 18) |
      (B64_LOOKUP[clean[i + 1]] << 12) |
      ((B64_LOOKUP[clean[i + 2]] ?? 0) << 6) |
      (B64_LOOKUP[clean[i + 3]] ?? 0);
    out[o++] = (n >> 16) & 0xff;
    if (clean[i + 2] !== undefined) out[o++] = (n >> 8) & 0xff;
    if (clean[i + 3] !== undefined) out[o++] = n & 0xff;
  }
  return out.subarray(0, o);
}

function utf8Encode(s: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
  return Uint8Array.from(unescape(encodeURIComponent(s)), (c) => c.charCodeAt(0));
}

function utf8Decode(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes);
  return decodeURIComponent(escape(String.fromCharCode(...bytes)));
}

// ─── PKCS8 (P-256) ───────────────────────────────────────────────────────────

/**
 * Extract the 32-byte private scalar from a WebCrypto PKCS8 export.
 * ECPrivateKey is `INTEGER 1, OCTET STRING(32)` — scan for that marker.
 */
export function pkcs8ToScalar(pkcs8: Uint8Array): Uint8Array {
  for (let i = 0; i < pkcs8.length - 37; i++) {
    if (
      pkcs8[i] === 0x02 &&
      pkcs8[i + 1] === 0x01 &&
      pkcs8[i + 2] === 0x01 &&
      pkcs8[i + 3] === 0x04 &&
      pkcs8[i + 4] === 0x20
    ) {
      return pkcs8.slice(i + 5, i + 37);
    }
  }
  throw new Error('Unrecognized PKCS8 key format');
}

/** Build a WebCrypto-compatible PKCS8 (with embedded public key). */
export function scalarToPkcs8(scalar: Uint8Array, publicKey: Uint8Array): Uint8Array {
  if (scalar.length !== 32 || publicKey.length !== 65) {
    throw new Error('Bad key lengths for PKCS8');
  }
  const head = [
    0x30, 0x81, 0x87, // SEQUENCE (135)
    0x02, 0x01, 0x00, // INTEGER 0
    0x30, 0x13, // SEQUENCE (19)
    0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, // OID ecPublicKey
    0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, // OID prime256v1
    0x04, 0x6d, // OCTET STRING (109)
    0x30, 0x6b, // SEQUENCE (107)
    0x02, 0x01, 0x01, // INTEGER 1
    0x04, 0x20, // OCTET STRING (32)
  ];
  const mid = [0xa1, 0x44, 0x03, 0x42, 0x00]; // [1] BIT STRING (66)
  return Uint8Array.from([...head, ...scalar, ...mid, ...publicKey]);
}

// ─── Key + cipher operations ─────────────────────────────────────────────────

export interface E2EKeys {
  /** base64 raw SEC1 uncompressed public key (wire format). */
  publicKeyB64: string;
  /** 32-byte private scalar. */
  scalar: Uint8Array;
}

export function generateKeys(): { keys: E2EKeys; privateKeyPkcs8B64: string } {
  const scalar = p256.utils.randomSecretKey();
  const publicKey = p256.getPublicKey(scalar, false); // 65B uncompressed
  return {
    keys: { publicKeyB64: toBase64(publicKey), scalar },
    privateKeyPkcs8B64: toBase64(scalarToPkcs8(scalar, publicKey)),
  };
}

export function keysFromServer(publicKeyB64: string, privateKeyPkcs8B64: string): E2EKeys {
  return { publicKeyB64, scalar: pkcs8ToScalar(fromBase64(privateKeyPkcs8B64)) };
}

const sharedKeyCache = new Map<string, Uint8Array>();

/** AES-256 key = x-coordinate of the ECDH shared point (WebCrypto behavior). */
function sharedKey(keys: E2EKeys, partnerPublicKeyB64: string): Uint8Array {
  let key = sharedKeyCache.get(partnerPublicKeyB64);
  if (!key) {
    const shared = p256.getSharedSecret(keys.scalar, fromBase64(partnerPublicKeyB64), false);
    key = shared.slice(1, 33);
    sharedKeyCache.set(partnerPublicKeyB64, key);
  }
  return key;
}

export function encryptText(
  text: string,
  keys: E2EKeys,
  partnerPublicKeyB64: string,
): { ciphertext: string; iv: string } {
  const iv = Crypto.getRandomValues(new Uint8Array(12));
  const ct = gcm(sharedKey(keys, partnerPublicKeyB64), iv).encrypt(utf8Encode(text));
  return { ciphertext: toBase64(ct), iv: toBase64(iv) };
}

/** Returns null when decryption fails (wrong/rotated keys). */
export function decryptText(
  ciphertext: string,
  iv: string,
  keys: E2EKeys,
  partnerPublicKeyB64: string,
): string | null {
  try {
    const pt = gcm(sharedKey(keys, partnerPublicKeyB64), fromBase64(iv)).decrypt(
      fromBase64(ciphertext),
    );
    return utf8Decode(pt);
  } catch {
    return null;
  }
}

export function clearSharedKeys() {
  sharedKeyCache.clear();
}
