/**
 * What a sponsor key (Swig treasury / paymaster) is allowed to co-sign.
 *
 * The treasury signs client-built transactions as FEE PAYER only. Its
 * signature is a real signature: put it on a transaction that also names the
 * treasury inside an instruction and that instruction runs with the
 * treasury's authority — a SystemProgram.transfer out of it, an assign, an
 * SPL transfer from an account it owns. relaySwigTransaction used to
 * partialSign whatever bytes the client sent, which made the treasury
 * drainable by any signed-in user.
 *
 * Pure (no web3 import) so tests/swig-relay-guard.test.ts can exercise it.
 */

export const SWIG_PROGRAM_ID = "swigypWHEksbC64pWKwah1WTeh9JXwx8H1rJHLdbQMB";
export const COMPUTE_BUDGET_PROGRAM_ID = "ComputeBudget111111111111111111111111111111";

/** SwigInstructionDiscriminator (u16 LE) — the only Swig ops a relay may carry. */
const SWIG_SIGN_V1 = 4;
const SWIG_SIGN_V2 = 11;

/** ComputeBudget ops the client builder emits (lib/swig/swig-signing.ts). */
const CB_SET_UNIT_LIMIT = 2;
const CB_SET_UNIT_PRICE = 3;
/**
 * Priority-fee ceiling the sponsor will pay. lib/solana/priority-fees.ts
 * falls back to 10_000; 2M µlamports × the 1.4M CU max = 0.0028 SOL, a hard
 * cap on what one relayed tx can burn from the treasury in fees.
 */
export const MAX_SPONSORED_MICROLAMPORTS = BigInt(2_000_000);

export interface GuardKey { pubkey: string; isSigner: boolean; isWritable: boolean }
export interface GuardInstruction { programId: string; keys: GuardKey[]; data: Uint8Array }

export class RelayRejected extends Error {}

function u16(data: Uint8Array, at: number): number {
    if (at + 2 > data.length) throw new RelayRejected("truncated instruction data");
    return data[at] | (data[at + 1] << 8);
}

/**
 * Account indices referenced by a Swig SignV1/V2 instruction's compact inner
 * instructions. Layout (@swig-wallet/coder getSignV{1,2}InstructionCodec):
 *   u16 discriminator, u16 payloadLen, u32 roleId,
 *   u8 count, then per ix: u8 programIdIndex, u8 n, u8[n] accounts,
 *   u16 dataLen, u8[dataLen] data
 * Throws on anything that does not parse cleanly inside payloadLen.
 */
export function swigInnerAccountIndices(data: Uint8Array): number[] {
    const payloadLen = u16(data, 2);
    const start = 8;
    const end = start + payloadLen;
    if (end > data.length) throw new RelayRejected("Swig payload length overruns instruction data");
    let at = start;
    const take = (n: number) => {
        if (at + n > end) throw new RelayRejected("malformed Swig compact instructions");
        const pos = at;
        at += n;
        return pos;
    };
    const count = data[take(1)];
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
        out.push(data[take(1)]); // programIdIndex
        const n = data[take(1)];
        for (let j = 0; j < n; j++) out.push(data[take(1)]);
        const dataLen = u16(data, take(2));
        take(dataLen);
    }
    if (at !== end) throw new RelayRejected("trailing bytes in Swig compact instructions");
    return out;
}

/**
 * Inner instructions the server is about to wrap in a Swig sign instruction
 * with the sponsor as payer (lib/swig/swig-server.ts
 * prepareSwigExecuteTransaction). The Swig SDK keeps an inner account's
 * signer flag, so an inner ix naming the sponsor would borrow its signature.
 */
export function assertInnerInstructionsAvoidSponsor(instructions: GuardInstruction[], sponsor: string): void {
    for (const ix of instructions) {
        if (ix.programId === sponsor || ix.keys.some((k) => k.pubkey === sponsor)) {
            throw new RelayRejected("Transaction may not reference the fee payer");
        }
    }
}

/**
 * A relayed, client-built transaction: the sponsor pays fees and nothing
 * else. Accepts exactly the shape lib/swig/swig-signing.ts
 * buildSwigTransaction produces — ComputeBudget limit/price plus Swig
 * SignV1/V2 instructions on the caller's OWN Swig — and rejects the rest.
 */
export function assertSponsorOnlyPaysFees(opts: {
    feePayer: string | undefined;
    instructions: GuardInstruction[];
    sponsor: string;
    swigAddress: string;
}): void {
    const { feePayer, instructions, sponsor, swigAddress } = opts;
    if (feePayer !== sponsor) throw new RelayRejected("Fee payer must be the sponsor");
    if (instructions.length === 0) throw new RelayRejected("Empty transaction");

    let swigIxs = 0;
    for (const ix of instructions) {
        if (ix.programId === COMPUTE_BUDGET_PROGRAM_ID) {
            if (ix.keys.length !== 0) throw new RelayRejected("Unexpected ComputeBudget accounts");
            const op = ix.data[0];
            if (op === CB_SET_UNIT_LIMIT && ix.data.length === 5) continue;
            if (op === CB_SET_UNIT_PRICE && ix.data.length === 9) {
                let price = BigInt(0);
                for (let i = 8; i >= 1; i--) price = (price << BigInt(8)) | BigInt(ix.data[i]);
                if (price > MAX_SPONSORED_MICROLAMPORTS) throw new RelayRejected("Priority fee above sponsor cap");
                continue;
            }
            throw new RelayRejected("Unsupported ComputeBudget instruction");
        }

        if (ix.programId !== SWIG_PROGRAM_ID) throw new RelayRejected("Only Swig instructions can be relayed");
        swigIxs++;
        const op = u16(ix.data, 0);
        if (op !== SWIG_SIGN_V1 && op !== SWIG_SIGN_V2) throw new RelayRejected("Only Swig sign instructions can be relayed");
        if (ix.keys[0]?.pubkey !== swigAddress) throw new RelayRejected("Swig instruction is not for your wallet");

        // The sponsor may sit in the account list only as SignV1's `payer`
        // (index 1). SignV2 has no payer slot at all.
        ix.keys.forEach((k, i) => {
            if (k.pubkey === sponsor && !(op === SWIG_SIGN_V1 && i === 1)) {
                throw new RelayRejected("Transaction may not reference the fee payer");
            }
        });
        // compactInstructions dedupes by pubkey, so an inner ix naming the
        // sponsor reuses the payer's index — only decoding catches it.
        for (const idx of swigInnerAccountIndices(ix.data)) {
            const key = ix.keys[idx];
            if (!key) throw new RelayRejected("Swig inner instruction references a missing account");
            if (key.pubkey === sponsor) throw new RelayRejected("Transaction may not reference the fee payer");
        }
    }
    if (swigIxs === 0) throw new RelayRejected("No Swig instruction to relay");
}
