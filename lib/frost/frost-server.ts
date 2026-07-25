// Server-only FROST helpers — never import from client components.
import { ed25519_FROST } from '@noble/curves/ed25519.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha512 } from '@noble/hashes/sha2.js';
import { deriveEd25519 } from '@/lib/chains/derive';
import type { FrostShare, FrostPublicInfo, SerializedCommitment } from './types';

// ── Serialization helpers ─────────────────────────────────────────────────────

export function serializePub(pub: ReturnType<typeof ed25519_FROST.trustedDealer>['public']): FrostPublicInfo {
    return {
        signers: pub.signers,
        commitments: pub.commitments.map((c: Uint8Array) => Buffer.from(c).toString('base64')),
        verifyingShares: Object.fromEntries(
            Object.entries(pub.verifyingShares).map(([k, v]) => [k, Buffer.from(v as Uint8Array).toString('base64')])
        ),
    };
}

export function deserializePub(info: FrostPublicInfo) {
    return {
        signers: info.signers,
        commitments: info.commitments.map(c => Buffer.from(c, 'base64')),
        verifyingShares: Object.fromEntries(
            Object.entries(info.verifyingShares).map(([k, v]) => [k, Buffer.from(v, 'base64')])
        ),
    };
}

export function deserializeShare(share: FrostShare) {
    return {
        identifier: share.identifier,
        signingShare: Buffer.from(share.signingShare, 'base64'),
    };
}

export function serializeCommitment(c: { identifier: string; hiding: Uint8Array; binding: Uint8Array }): SerializedCommitment {
    return {
        identifier: c.identifier,
        hiding: Buffer.from(c.hiding).toString('base64'),
        binding: Buffer.from(c.binding).toString('base64'),
    };
}

export function deserializeCommitment(c: SerializedCommitment) {
    return {
        identifier: c.identifier,
        hiding: Buffer.from(c.hiding, 'base64'),
        binding: Buffer.from(c.binding, 'base64'),
    };
}

// ── Key generation ────────────────────────────────────────────────────────────

export interface FrostKeygenResult {
    serverShare: FrostShare;
    clientShare: FrostShare;
    publicInfo: FrostPublicInfo;
    /** base64 — Ed25519 group public key, used as Swig root authority */
    groupPublicKey: string;
}

export function generateFrostKeypair(): FrostKeygenResult {
    // Let FROST generate a valid random scalar internally (undefined = random)
    const { public: pub, secretShares } = ed25519_FROST.trustedDealer(
        { min: 2, max: 2 },
        undefined,
        undefined
    );

    return packKeygen(pub, secretShares);
}

/**
 * Deterministic FROST keygen from the account mnemonic seed.
 *
 * The group public key is the Swig root authority, so deriving it from the seed
 * is what puts the user's Solana smart wallet under the same 12 words as every
 * other chain — one phrase restores the whole account. Both the secret scalar
 * and the share-splitting randomness are seeded, so re-running this with the
 * same mnemonic reproduces byte-identical shares.
 *
 * Safe to make deterministic: anyone holding the seed can already reconstruct
 * the group secret, so seeding the split leaks nothing further.
 *
 * Wallets created before this existed used the random path above and CANNOT be
 * regenerated from their phrase — see scripts/wallet/backfill-multichain.ts.
 */
export function generateFrostKeypairFromSeed(seed: Uint8Array): FrostKeygenResult {
    const secret = deriveFrostSecret(seed);
    const rng = deterministicRng(seed, 'watchparty/frost/shares/v1');

    const { public: pub, secretShares } = ed25519_FROST.trustedDealer(
        { min: 2, max: 2 },
        undefined,
        secret,
        rng
    );

    return packKeygen(pub, secretShares);
}

function packKeygen(
    pub: ReturnType<typeof ed25519_FROST.trustedDealer>['public'],
    secretShares: ReturnType<typeof ed25519_FROST.trustedDealer>['secretShares']
): FrostKeygenResult {
    const ids = Object.keys(secretShares);
    const rawShare1 = secretShares[ids[0]];
    const rawShare2 = secretShares[ids[1]];

    return {
        serverShare: { identifier: rawShare1.identifier, signingShare: Buffer.from(rawShare1.signingShare).toString('base64') },
        clientShare: { identifier: rawShare2.identifier, signingShare: Buffer.from(rawShare2.signingShare).toString('base64') },
        publicInfo: serializePub(pub),
        groupPublicKey: Buffer.from(pub.commitments[0]).toString('base64'),
    };
}

/**
 * The FROST group secret, derived on a path of its own so it is never the same
 * scalar as the mnemonic's plain Solana signing key.
 *
 * Returned as a canonical little-endian scalar in [1, L-1]. The raw 32-byte
 * SLIP-0010 output can't be used directly: it's uniform over 2^256 but the
 * ed25519 group order L is just above 2^252, so ~15 of every 16 derived keys
 * would land outside the field and `Fn.fromBytes` rejects them. Expanding to
 * 64 bytes and reducing mod L is the RFC 8032 wide-reduction fix — uniform,
 * deterministic, and always valid.
 */
export function deriveFrostSecret(seed: Uint8Array): Uint8Array {
    const raw = deriveEd25519(seed, FROST_PATH);
    const wide = hmac(sha512, new TextEncoder().encode('watchparty/frost/secret/v1'), raw);
    let scalar = bytesToNumberLE(wide) % ED25519_ORDER;
    if (scalar === ZERO) scalar = ONE; // RFC 9591 §3.1 rejects the identity element
    return numberToBytesLE(scalar, 32);
}

// ed25519 group order L = 2^252 + 27742317777372353535851937790883648493.
// Written as a decimal string, not a bigint literal: this project's tsconfig
// targets below ES2020, where `123n` is a compile error.
const ED25519_ORDER = BigInt(
    '7237005577332262213973186563042994240857116359379907606001950938285454250989'
);
const BYTE = BigInt(256);
const ZERO = BigInt(0);
const ONE = BigInt(1);

function bytesToNumberLE(bytes: Uint8Array): bigint {
    let n = ZERO;
    for (let i = bytes.length - 1; i >= 0; i--) n = n * BYTE + BigInt(bytes[i]);
    return n;
}

function numberToBytesLE(n: bigint, len: number): Uint8Array {
    const out = new Uint8Array(len);
    let rest = n;
    for (let i = 0; i < len; i++) {
        out[i] = Number(rest % BYTE);
        rest = rest / BYTE;
    }
    return out;
}

/** Sibling of the Solana account path — distinct domain, same phrase. */
export const FROST_PATH = "m/44'/501'/0'/1'";

/**
 * Counter-mode HMAC-SHA512 stream, shaped like @noble's `randomBytes`.
 * Deterministic for a given (seed, domain).
 */
function deterministicRng(
    seed: Uint8Array,
    domain: string
): (bytesLength?: number) => Uint8Array<ArrayBuffer> {
    const key = hmac(sha512, new TextEncoder().encode(domain), seed);
    let counter = 0;
    let pool = new Uint8Array(0);

    return (bytesLength = 32) => {
        while (pool.length < bytesLength) {
            const block = new Uint8Array(4);
            new DataView(block.buffer).setUint32(0, counter++, false);
            const next = hmac(sha512, key, block);
            const grown = new Uint8Array(pool.length + next.length);
            grown.set(pool);
            grown.set(next, pool.length);
            pool = grown;
        }
        // Fresh Uint8Array (not .slice) so the buffer type is ArrayBuffer, which
        // is what @noble's RNG signature requires.
        const out = new Uint8Array(bytesLength);
        out.set(pool.subarray(0, bytesLength));
        pool = pool.slice(bytesLength);
        return out;
    };
}

// ── Round 1: server commit ────────────────────────────────────────────────────

export interface ServerCommitResult {
    nonces: { hiding: string; binding: string }; // base64 — store in Redis, never send to client
    serverCommitment: SerializedCommitment;
}

export function serverCommit(serverShare: FrostShare): ServerCommitResult {
    const share = deserializeShare(serverShare);
    const { nonces, commitments } = ed25519_FROST.commit(share);
    return {
        nonces: {
            hiding: Buffer.from(nonces.hiding).toString('base64'),
            binding: Buffer.from(nonces.binding).toString('base64'),
        },
        serverCommitment: serializeCommitment(commitments),
    };
}

// ── Round 2: server sign + aggregate ─────────────────────────────────────────

export function serverSignAndAggregate(
    serverShare: FrostShare,
    publicInfo: FrostPublicInfo,
    storedNonces: { hiding: string; binding: string },
    clientCommitment: SerializedCommitment,
    serverCommitment: SerializedCommitment,
    clientSigShare: string, // base64
    messageBytes: Uint8Array,
): Uint8Array {
    const share = deserializeShare(serverShare);
    const pub = deserializePub(publicInfo);

    const nonces = {
        hiding: Buffer.from(storedNonces.hiding, 'base64'),
        binding: Buffer.from(storedNonces.binding, 'base64'),
    };

    const commitmentList = [
        deserializeCommitment(clientCommitment),
        deserializeCommitment(serverCommitment),
    ];

    const serverSigShare = ed25519_FROST.signShare(share, pub, nonces, commitmentList, messageBytes);
    const clientSigShareBytes = Buffer.from(clientSigShare, 'base64');

    const sigShares: Record<string, Uint8Array> = {
        [deserializeCommitment(clientCommitment).identifier]: clientSigShareBytes,
        [deserializeCommitment(serverCommitment).identifier]: serverSigShare,
    };

    return ed25519_FROST.aggregate(pub, commitmentList, messageBytes, sigShares) as Uint8Array;
}

// ── Transaction message extraction ───────────────────────────────────────────

export async function extractMessageBytes(txBase64: string): Promise<Uint8Array> {
    const { Transaction, VersionedTransaction } = await import('@solana/web3.js');
    const txBuf = Buffer.from(txBase64, 'base64');
    try {
        const versioned = VersionedTransaction.deserialize(txBuf);
        return versioned.message.serialize();
    } catch {
        const legacy = Transaction.from(txBuf);
        return legacy.serializeMessage();
    }
}

export async function insertFrostSignature(
    txBase64: string,
    frostGroupPubkeyBase64: string,
    signature: Uint8Array,
): Promise<string> {
    const { Transaction, PublicKey } = await import('@solana/web3.js');
    const tx = Transaction.from(Buffer.from(txBase64, 'base64'));
    const pubkey = new PublicKey(Buffer.from(frostGroupPubkeyBase64, 'base64'));
    tx.addSignature(pubkey, Buffer.from(signature));
    return tx.serialize({ requireAllSignatures: false }).toString('base64');
}
