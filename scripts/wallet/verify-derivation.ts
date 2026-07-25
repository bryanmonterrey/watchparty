/**
 * Test vectors for lib/chains/derive.ts.
 *
 * A derivation bug sends funds to an address nobody holds the key to, and it
 * fails silently — the address looks fine. So every primitive is pinned to a
 * published vector rather than to our own output.
 *
 *   bun run scripts/wallet/verify-derivation.ts
 *
 * Sources:
 *   SLIP-0010 ed25519  github.com/satoshilabs/slips/blob/master/slip-0010.md
 *   BIP-84 p2wpkh      github.com/bitcoin/bips/blob/master/bip-0084.mediawiki
 *   EIP-55 checksum    the canonical "abandon…about" BIP-39 test mnemonic
 */

import { PublicKey } from "@solana/web3.js";
import {
  base58Encode,
  bytesToHex,
  deriveBitcoin,
  deriveEd25519,
  deriveEvm,
  deriveSolana,
  deriveSui,
  seedFromMnemonic,
} from "@/lib/chains/derive";
import { ed25519 } from "@noble/curves/ed25519.js";

const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

let failures = 0;

function check(label: string, actual: string, expected: string) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) {
    console.log(`    expected  ${expected}`);
    console.log(`    actual    ${actual}`);
  }
}

function assert(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`${cond ? "✓" : "✗"} ${label}${cond ? "" : `  — ${detail}`}`);
}

// ── SLIP-0010 ed25519 (drives BOTH Solana and Sui) ───────────────────────────
// Official test vector 1, seed 000102030405060708090a0b0c0d0e0f.
console.log("\nSLIP-0010 ed25519 (official vector 1)");
{
  const seed = Uint8Array.from(Buffer.from("000102030405060708090a0b0c0d0e0f", "hex"));

  const m0h = deriveEd25519(seed, "m/0'");
  check(
    "m/0' private key",
    bytesToHex(m0h),
    "68e0fe46dfb67e368c75379acec591dad19df3cde26e63b93a8e704f1dade7a3"
  );
  check(
    "m/0' public key",
    `00${bytesToHex(ed25519.getPublicKey(m0h))}`,
    "008c8a13df77a28f3445213a0f432fde644acaa215fc72dcdf300d5efaa85d350c"
  );

  const m0h1h = deriveEd25519(seed, "m/0'/1'");
  check(
    "m/0'/1' private key",
    bytesToHex(m0h1h),
    "b1d0bad404bf35da785a64ca1ac54b2617211d2777696fbffaf208f746ae84f2"
  );
  check(
    "m/0'/1' public key",
    `00${bytesToHex(ed25519.getPublicKey(m0h1h))}`,
    "001932a5270f335bed617d5b935c80aedb1a35bd9fc1e31acafd5372c30f5c1187"
  );
}

// Non-hardened segments must be rejected, not silently derived.
{
  let threw = false;
  try {
    deriveEd25519(new Uint8Array(32), "m/44'/501'/0'/0");
  } catch {
    threw = true;
  }
  assert("rejects non-hardened ed25519 path", threw, "unhardened path was accepted");
}

// ── Bitcoin BIP-84 ───────────────────────────────────────────────────────────
console.log("\nBitcoin BIP-84 (official vector)");
{
  const seed = seedFromMnemonic(TEST_MNEMONIC);
  check(
    "m/84'/0'/0'/0/0 address",
    deriveBitcoin(seed).address,
    "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu"
  );
  check(
    "m/84'/0'/0'/0/1 address",
    deriveBitcoin(seed, "m/84'/0'/0'/0/1").address,
    "bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g"
  );
}

// ── EVM BIP-44 + EIP-55 ──────────────────────────────────────────────────────
console.log("\nEVM BIP-44 / EIP-55");
{
  const seed = seedFromMnemonic(TEST_MNEMONIC);
  check(
    "m/44'/60'/0'/0/0 address",
    deriveEvm(seed).address,
    "0x9858EfFD232B4033E47d90003D41EC34EcaEda94"
  );
}

// ── base58: cross-check our encoder against Solana's own ─────────────────────
console.log("\nbase58 encoder vs @solana/web3.js");
{
  let mismatches = 0;
  for (let i = 0; i < 200; i++) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    if (base58Encode(bytes) !== new PublicKey(bytes).toBase58()) mismatches++;
  }
  assert("200 random 32-byte keys encode identically", mismatches === 0, `${mismatches} mismatched`);

  // Leading zero bytes are the classic base58 edge case.
  const leadingZeros = new Uint8Array(32);
  leadingZeros[31] = 1;
  check(
    "leading-zero key",
    base58Encode(leadingZeros),
    new PublicKey(leadingZeros).toBase58()
  );
}

// ── Shape checks for the account chains ──────────────────────────────────────
console.log("\nderived account addresses (shape)");
{
  const seed = seedFromMnemonic(TEST_MNEMONIC);
  const sol = deriveSolana(seed);
  const sui = deriveSui(seed);

  assert(
    "solana address is a valid 32-byte pubkey",
    (() => {
      try {
        return new PublicKey(sol.address).toBytes().length === 32;
      } catch {
        return false;
      }
    })(),
    sol.address
  );
  assert("sui address is 0x + 64 hex", /^0x[0-9a-f]{64}$/.test(sui.address), sui.address);

  console.log(`\n  one phrase → four addresses:`);
  console.log(`    solana   ${sol.address}`);
  console.log(`    evm      ${deriveEvm(seed).address}`);
  console.log(`    bitcoin  ${deriveBitcoin(seed).address}`);
  console.log(`    sui      ${sui.address}`);
}

// ── Determinism: same phrase must always give the same addresses ─────────────
{
  const a = seedFromMnemonic(TEST_MNEMONIC);
  const b = seedFromMnemonic(TEST_MNEMONIC);
  const same =
    deriveSolana(a).address === deriveSolana(b).address &&
    deriveEvm(a).address === deriveEvm(b).address &&
    deriveBitcoin(a).address === deriveBitcoin(b).address &&
    deriveSui(a).address === deriveSui(b).address;
  assert("derivation is deterministic", same);
}

console.log(
  failures === 0
    ? "\nall derivation vectors passed\n"
    : `\n${failures} FAILED — do not ship\n`
);
process.exit(failures === 0 ? 0 : 1);
