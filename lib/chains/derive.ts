// One mnemonic → every chain address.
//
// This is the root of the multichain account model: a single BIP39 phrase
// derives the Solana, EVM, Bitcoin and Sui keys, so the user has exactly one
// thing to back up. Each address kind gets its own SLIP-44 path, matching what
// Phantom issues for the same phrase — export the phrase into Phantom and the
// addresses line up.
//
// Correctness here is unforgiving: a wrong path or encoding sends funds to an
// address nobody holds the key to. Every function below is covered by the
// official SLIP-0010 / BIP-84 / EIP-55 test vectors in
// scripts/wallet/verify-derivation.ts — run it after touching this file.

import { hmac } from "@noble/hashes/hmac.js";
import { sha512 } from "@noble/hashes/sha2.js";
// blake2.js carries blake2b in both @noble/hashes 1.8 (the console's copy) and
// 2.x (the root's since 2026-10-01); blake2b.js was dropped in 2.0.
import { blake2b } from "@noble/hashes/blake2.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync } from "@scure/bip39";
import { p2wpkh } from "@scure/btc-signer";
import { privateKeyToAccount } from "viem/accounts";
import { KIND_PATHS } from "./registry";
import type { ChainKind, DerivedAddress } from "./types";

// ── SLIP-0010 ed25519 ────────────────────────────────────────────────────────
// @scure/bip32 is BIP32/secp256k1 only. ed25519 chains (Solana, Sui) use
// SLIP-0010, where every level MUST be hardened — there is no public derivation.

const ED25519_CURVE = "ed25519 seed";
const HARDENED_OFFSET = 0x80000000;

interface Slip10Node {
  key: Uint8Array;
  chainCode: Uint8Array;
}

function slip10Master(seed: Uint8Array): Slip10Node {
  const I = hmac(sha512, new TextEncoder().encode(ED25519_CURVE), seed);
  return { key: I.slice(0, 32), chainCode: I.slice(32) };
}

function slip10CKDPriv(node: Slip10Node, index: number): Slip10Node {
  // data = 0x00 || key || ser32(index)
  const data = new Uint8Array(1 + 32 + 4);
  data[0] = 0;
  data.set(node.key, 1);
  new DataView(data.buffer).setUint32(33, index, false);
  const I = hmac(sha512, node.chainCode, data);
  return { key: I.slice(0, 32), chainCode: I.slice(32) };
}

function parsePath(path: string): number[] {
  const parts = path.split("/");
  if (parts[0] !== "m") throw new Error(`derive: path must start with "m": ${path}`);
  return parts.slice(1).map((p) => {
    const hardened = p.endsWith("'") || p.endsWith("h");
    const n = Number.parseInt(hardened ? p.slice(0, -1) : p, 10);
    if (!Number.isInteger(n) || n < 0) throw new Error(`derive: bad path segment "${p}"`);
    return hardened ? n + HARDENED_OFFSET : n;
  });
}

/** SLIP-0010 ed25519 private key at `path`. All segments must be hardened. */
export function deriveEd25519(seed: Uint8Array, path: string): Uint8Array {
  const indices = parsePath(path);
  let node = slip10Master(seed);
  for (const index of indices) {
    if (index < HARDENED_OFFSET) {
      throw new Error(`derive: ed25519 requires hardened segments, got ${path}`);
    }
    node = slip10CKDPriv(node, index);
  }
  return node.key;
}

// ── Per-kind derivation ──────────────────────────────────────────────────────

export interface DerivedKey {
  kind: ChainKind;
  address: string;
  derivationPath: string;
  /** Raw private key material. NEVER persist unencrypted, never send to a client. */
  privateKey: Uint8Array;
  /** Public key — ed25519 raw 32B, secp256k1 compressed 33B. */
  publicKey: Uint8Array;
}

/** Solana: SLIP-0010 ed25519, base58 public key. */
export function deriveSolana(seed: Uint8Array, path = KIND_PATHS.solana): DerivedKey {
  const privateKey = deriveEd25519(seed, path);
  const publicKey = ed25519.getPublicKey(privateKey);
  // base58 encode via the same encoder Solana uses.
  return {
    kind: "solana",
    address: base58Encode(publicKey),
    derivationPath: path,
    privateKey,
    publicKey,
  };
}

/** EVM: BIP32 secp256k1, EIP-55 checksummed 0x address. Shared by all 5 EVM chains. */
export function deriveEvm(seed: Uint8Array, path = KIND_PATHS.evm): DerivedKey {
  const hd = HDKey.fromMasterSeed(seed).derive(path);
  if (!hd.privateKey || !hd.publicKey) throw new Error("derive: EVM derivation produced no key");
  const account = privateKeyToAccount(`0x${bytesToHex(hd.privateKey)}`);
  return {
    kind: "evm",
    address: account.address,
    derivationPath: path,
    privateKey: hd.privateKey,
    publicKey: hd.publicKey,
  };
}

/** Bitcoin: BIP-84 native segwit (bc1q…). */
export function deriveBitcoin(seed: Uint8Array, path = KIND_PATHS.bitcoin): DerivedKey {
  const hd = HDKey.fromMasterSeed(seed).derive(path);
  if (!hd.privateKey || !hd.publicKey) throw new Error("derive: BTC derivation produced no key");
  const payment = p2wpkh(hd.publicKey);
  if (!payment.address) throw new Error("derive: p2wpkh produced no address");
  return {
    kind: "bitcoin",
    address: payment.address,
    derivationPath: path,
    privateKey: hd.privateKey,
    publicKey: hd.publicKey,
  };
}

/** Sui: SLIP-0010 ed25519; address = blake2b256(flag ‖ pubkey), flag 0x00 = ed25519. */
export function deriveSui(seed: Uint8Array, path = KIND_PATHS.sui): DerivedKey {
  const privateKey = deriveEd25519(seed, path);
  const publicKey = ed25519.getPublicKey(privateKey);
  const flagged = new Uint8Array(1 + publicKey.length);
  flagged[0] = 0x00;
  flagged.set(publicKey, 1);
  const hash = blake2b(flagged, { dkLen: 32 });
  return {
    kind: "sui",
    address: `0x${bytesToHex(hash)}`,
    derivationPath: path,
    privateKey,
    publicKey,
  };
}

const DERIVERS: Record<ChainKind, (seed: Uint8Array, path?: string) => DerivedKey> = {
  solana: deriveSolana,
  evm: deriveEvm,
  bitcoin: deriveBitcoin,
  sui: deriveSui,
};

/** Derive the key for one address kind. */
export function deriveKey(seed: Uint8Array, kind: ChainKind): DerivedKey {
  return DERIVERS[kind](seed);
}

/** Derive every address kind at once. Private keys included — server-side only. */
export function deriveAllKeys(seed: Uint8Array): DerivedKey[] {
  return (Object.keys(DERIVERS) as ChainKind[]).map((kind) => deriveKey(seed, kind));
}

/** Public-safe view: addresses only, no key material. Safe to persist/return. */
export function deriveAllAddresses(seed: Uint8Array): DerivedAddress[] {
  return deriveAllKeys(seed).map(({ kind, address, derivationPath }) => ({
    kind,
    address,
    derivationPath,
  }));
}

/** BIP39 phrase → 64-byte seed. The single root of the whole account. */
export function seedFromMnemonic(mnemonic: string, passphrase = ""): Uint8Array {
  return mnemonicToSeedSync(mnemonic.trim(), passphrase);
}

export function deriveAllAddressesFromMnemonic(mnemonic: string): DerivedAddress[] {
  return deriveAllAddresses(seedFromMnemonic(mnemonic));
}

// ── encoding helpers ─────────────────────────────────────────────────────────

const B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** base58 (Bitcoin alphabet, no checksum) — Solana address encoding. */
export function base58Encode(bytes: Uint8Array): string {
  let leadingZeros = 0;
  while (leadingZeros < bytes.length && bytes[leadingZeros] === 0) leadingZeros++;

  const digits: number[] = [];
  for (let i = leadingZeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }

  let out = "1".repeat(leadingZeros);
  for (let i = digits.length - 1; i >= 0; i--) out += B58_ALPHABET[digits[i]];
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}
