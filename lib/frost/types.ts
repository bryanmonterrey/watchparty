// Shared FROST types — safe to import on both client and server.

export interface FrostShare {
    identifier: string; // hex-encoded share identifier
    signingShare: string; // base64-encoded 32-byte signing share
}

export interface FrostPublicInfo {
    signers: { min: number; max: number };
    commitments: string[]; // base64-encoded VSS commitments; [0] = group public key
    verifyingShares: Record<string, string>; // identifier → base64 verifying share
}

export interface SerializedCommitment {
    identifier: string; // hex
    hiding: string; // base64
    binding: string; // base64
}
