import { describe, expect, test } from "bun:test";
// Encode with the Swig SDK's own codec so the hand-written parser in
// relay-guard is checked against the real wire format, not a mirror of itself.
import { getSignV1InstructionCodec, getSignV2InstructionCodec } from "@swig-wallet/coder";
import {
    assertInnerInstructionsAvoidSponsor,
    assertSponsorOnlyPaysFees,
    COMPUTE_BUDGET_PROGRAM_ID,
    RelayRejected,
    SWIG_PROGRAM_ID,
    swigInnerAccountIndices,
    type GuardInstruction,
} from "@/lib/swig/relay-guard";

const TREASURY = "Treasury1111111111111111111111111111111111";
const SWIG = "SwigAcct11111111111111111111111111111111111";
const OTHER_SWIG = "OtherSwig1111111111111111111111111111111111";
const SESSION = "Session111111111111111111111111111111111111";
const JUP = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
const POOL = "Pool111111111111111111111111111111111111111";
const SYSTEM = "11111111111111111111111111111111";

const key = (pubkey: string, isSigner = false, isWritable = false) => ({ pubkey, isSigner, isWritable });

function cuLimit(units: number): GuardInstruction {
    const data = new Uint8Array(5);
    data[0] = 2;
    new DataView(data.buffer).setUint32(1, units, true);
    return { programId: COMPUTE_BUDGET_PROGRAM_ID, keys: [], data };
}
function cuPrice(micro: bigint): GuardInstruction {
    const data = new Uint8Array(9);
    data[0] = 3;
    new DataView(data.buffer).setBigUint64(1, micro, true);
    return { programId: COMPUTE_BUDGET_PROGRAM_ID, keys: [], data };
}

/** SignV1 laid out the way @swig-wallet/lib compactInstructions builds it. */
function signV1(keys: GuardInstruction["keys"], inner: { programIdIndex: number; accounts: number[] }[]): GuardInstruction {
    const data = getSignV1InstructionCodec(1).encoder.encode({
        roleId: 1,
        compactInstructions: inner.map((ix) => ({ ...ix, data: new Uint8Array([9, 9, 9]) })),
        authorityPayload: new Uint8Array([2]),
    } as never);
    return { programId: SWIG_PROGRAM_ID, keys, data: new Uint8Array(data) };
}

// [swig, payer, session authority] then inner accounts — index 3 is Jupiter.
const legitKeys = [key(SWIG, false, true), key(TREASURY, true, true), key(SESSION, true), key(JUP), key(POOL, false, true)];
const legitSwig = () => signV1(legitKeys, [{ programIdIndex: 3, accounts: [4, 0] }]);

const ok = (instructions: GuardInstruction[], feePayer = TREASURY) =>
    assertSponsorOnlyPaysFees({ feePayer, instructions, sponsor: TREASURY, swigAddress: SWIG });

describe("swigInnerAccountIndices", () => {
    test("decodes the SDK's own SignV1 encoding", () => {
        expect(swigInnerAccountIndices(legitSwig().data)).toEqual([3, 4, 0]);
    });
    test("rejects truncated data", () => {
        const data = legitSwig().data.slice(0, 10);
        expect(() => swigInnerAccountIndices(data)).toThrow(RelayRejected);
    });
});

describe("assertSponsorOnlyPaysFees", () => {
    test("accepts the shape buildSwigTransaction produces", () => {
        expect(() => ok([cuLimit(200_000), cuPrice(10_000n), legitSwig()])).not.toThrow();
    });

    test("rejects a direct transfer out of the treasury", () => {
        const drain: GuardInstruction = {
            programId: SYSTEM,
            keys: [key(TREASURY, true, true), key("Attacker111111111111111111111111111111111111", false, true)],
            data: new Uint8Array([2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
        };
        expect(() => ok([drain])).toThrow(RelayRejected);
        expect(() => ok([legitSwig(), drain])).toThrow(RelayRejected);
    });

    test("rejects a Swig inner instruction that borrows the treasury (payer index)", () => {
        const borrow = signV1(legitKeys, [{ programIdIndex: 3, accounts: [1, 4] }]);
        expect(() => ok([borrow])).toThrow(/fee payer/);
    });

    test("rejects the treasury anywhere but SignV1's payer slot", () => {
        const keys = [...legitKeys, key(TREASURY, true, true)];
        expect(() => ok([signV1(keys, [{ programIdIndex: 3, accounts: [4] }])])).toThrow(RelayRejected);
    });

    test("rejects SignV2 that names the treasury at all", () => {
        const data = getSignV2InstructionCodec(1).encoder.encode({
            roleId: 1,
            compactInstructions: [{ programIdIndex: 3, accounts: [4], data: new Uint8Array([1]) }],
            authorityPayload: new Uint8Array([2]),
        } as never);
        const v2 = { programId: SWIG_PROGRAM_ID, keys: [key(SWIG, false, true), key(TREASURY, true, true), key(SESSION, true), key(JUP), key(POOL)], data: new Uint8Array(data) };
        expect(() => ok([v2])).toThrow(RelayRejected);
    });

    test("rejects someone else's Swig", () => {
        const keys = [key(OTHER_SWIG, false, true), ...legitKeys.slice(1)];
        expect(() => ok([signV1(keys, [{ programIdIndex: 3, accounts: [4, 0] }])])).toThrow(/your wallet/);
    });

    test("rejects a fee payer other than the treasury", () => {
        expect(() => ok([legitSwig()], SESSION)).toThrow(RelayRejected);
    });

    test("caps the priority fee the treasury will pay", () => {
        expect(() => ok([cuPrice(2_000_001n), legitSwig()])).toThrow(/cap/);
    });

    test("rejects an inner account index past the account list", () => {
        expect(() => ok([signV1(legitKeys, [{ programIdIndex: 3, accounts: [40] }])])).toThrow(RelayRejected);
    });

    test("rejects a transaction with no Swig instruction", () => {
        expect(() => ok([cuLimit(200_000)])).toThrow(RelayRejected);
    });
});

describe("assertInnerInstructionsAvoidSponsor", () => {
    test("passes ordinary inner instructions", () => {
        expect(() => assertInnerInstructionsAvoidSponsor([{ programId: JUP, keys: [key(SWIG), key(POOL)], data: new Uint8Array() }], TREASURY)).not.toThrow();
    });
    test("rejects an inner instruction naming the treasury", () => {
        expect(() => assertInnerInstructionsAvoidSponsor([{ programId: SYSTEM, keys: [key(TREASURY, true, true)], data: new Uint8Array() }], TREASURY)).toThrow(RelayRejected);
    });
});
