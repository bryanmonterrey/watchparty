'use client';

import { ed25519_FROST } from '@noble/curves/ed25519.js';
import type { FrostShare, FrostPublicInfo, SerializedCommitment } from './types';

function deserializePub(info: FrostPublicInfo) {
    return {
        signers: info.signers,
        commitments: info.commitments.map(c => Buffer.from(c, 'base64')),
        verifyingShares: Object.fromEntries(
            Object.entries(info.verifyingShares).map(([k, v]) => [k, Buffer.from(v, 'base64')])
        ),
    };
}

function deserializeShare(share: FrostShare) {
    return {
        identifier: share.identifier,
        signingShare: Buffer.from(share.signingShare, 'base64'),
    };
}

function deserializeCommitment(c: SerializedCommitment) {
    return {
        identifier: c.identifier,
        hiding: Buffer.from(c.hiding, 'base64'),
        binding: Buffer.from(c.binding, 'base64'),
    };
}

export interface ClientRound1Result {
    nonces: { hiding: Uint8Array; binding: Uint8Array };
    clientCommitment: SerializedCommitment;
}

export async function clientCommit(clientShare: FrostShare): Promise<ClientRound1Result> {
    const share = deserializeShare(clientShare);
    const { nonces, commitments } = ed25519_FROST.commit(share);
    return {
        nonces,
        clientCommitment: {
            identifier: commitments.identifier,
            hiding: Buffer.from(commitments.hiding).toString('base64'),
            binding: Buffer.from(commitments.binding).toString('base64'),
        },
    };
}

export async function clientSignShare(
    clientShare: FrostShare,
    publicInfo: FrostPublicInfo,
    nonces: { hiding: Uint8Array; binding: Uint8Array },
    clientCommitment: SerializedCommitment,
    serverCommitment: SerializedCommitment,
    messageBytes: Uint8Array,
): Promise<string> {
    const share = deserializeShare(clientShare);
    const pub = deserializePub(publicInfo);
    const commitmentList = [
        deserializeCommitment(clientCommitment),
        deserializeCommitment(serverCommitment),
    ];
    const sigShare = ed25519_FROST.signShare(share, pub, nonces, commitmentList, messageBytes);
    return Buffer.from(sigShare).toString('base64');
}

export async function extractClientMessageBytes(txBase64: string): Promise<Uint8Array> {
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
