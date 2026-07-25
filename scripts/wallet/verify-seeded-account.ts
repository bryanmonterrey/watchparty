/**
 * Proves the Solana half of the account is recoverable from the phrase.
 *
 * The FROST group key is the Swig root authority and the swig id seeds the PDA;
 * both used to be random, which is exactly why old wallets can't be restored
 * from their 12 words. This pins the seeded replacements as reproducible, and
 * pins the legacy random paths as still-random so back-compat doesn't rot.
 *
 *   bun run scripts/wallet/verify-seeded-account.ts
 */

import {
  deriveFrostSecret,
  generateFrostKeypair,
  generateFrostKeypairFromSeed,
} from "@/lib/frost/frost-server";
import { bytesToHex, deriveSolana, seedFromMnemonic } from "@/lib/chains/derive";
import { computeSwigPda, computeSwigPdaFromSeed } from "@/lib/swig/swig-server";
import { ed25519 } from "@noble/curves/ed25519.js";

const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const OTHER_MNEMONIC = TEST_MNEMONIC.replace("about", "abstract");

let failures = 0;
function assert(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`${cond ? "✓" : "✗"} ${label}${cond ? "" : `  — ${detail}`}`);
}

const seed = seedFromMnemonic(TEST_MNEMONIC);
const otherSeed = seedFromMnemonic(OTHER_MNEMONIC);

console.log("\nseeded FROST keygen");
{
  const a = generateFrostKeypairFromSeed(seed);
  const b = generateFrostKeypairFromSeed(seed);
  const other = generateFrostKeypairFromSeed(otherSeed);

  assert("group public key reproduces", a.groupPublicKey === b.groupPublicKey);
  assert("server share reproduces", a.serverShare.signingShare === b.serverShare.signingShare);
  assert("client share reproduces", a.clientShare.signingShare === b.clientShare.signingShare);
  assert("group key is a 32-byte ed25519 point", Buffer.from(a.groupPublicKey, "base64").length === 32);
  assert("different phrase → different group key", a.groupPublicKey !== other.groupPublicKey);
  assert(
    "FROST secret is not the plain Solana signing key",
    bytesToHex(deriveFrostSecret(seed)) !== bytesToHex(deriveSolana(seed).privateKey)
  );

  // Proves our scalar encoding is the one FROST actually read. If the
  // little-endian assumption were wrong, the library would have consumed a
  // different scalar and this would not line up.
  const secret = deriveFrostSecret(seed);
  let n = BigInt(0);
  for (let i = secret.length - 1; i >= 0; i--) n = n * BigInt(256) + BigInt(secret[i]);
  const expected = Buffer.from(ed25519.Point.BASE.multiply(n).toBytes()).toString("base64");
  assert("group key == basepoint × derived secret", a.groupPublicKey === expected, expected);

  // Legacy wallets depend on this staying non-deterministic.
  assert(
    "legacy random keygen is still random",
    generateFrostKeypair().groupPublicKey !== generateFrostKeypair().groupPublicKey
  );
}

console.log("\nseeded Swig PDA");
{
  const a = computeSwigPdaFromSeed(seed);
  const b = computeSwigPdaFromSeed(seed);
  const other = computeSwigPdaFromSeed(otherSeed);

  assert("swig id reproduces", a.swigId === b.swigId);
  assert("swig address reproduces", a.swigAddress === b.swigAddress);
  assert("different phrase → different swig address", a.swigAddress !== other.swigAddress);
  assert("legacy random swig id is still random", computeSwigPda().swigId !== computeSwigPda().swigId);

  console.log(`\n  phrase → solana (swig) address:  ${a.swigAddress}`);
}

console.log(
  failures === 0
    ? "\nseeded account is fully phrase-recoverable\n"
    : `\n${failures} FAILED — do not ship\n`
);
process.exit(failures === 0 ? 0 : 1);
