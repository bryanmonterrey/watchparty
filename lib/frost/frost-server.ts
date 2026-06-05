// Server-only FROST helpers — never import from client components.
import { ed25519_FROST } from '@noble/curves/ed25519.js';
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
