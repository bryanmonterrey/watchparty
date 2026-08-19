import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { PLATFORM_FEE_BPS, PLATFORM_FEE_BPS_BIG } from "@/lib/chains/fee-bps";

// One rate, stated once.
//
// Before lib/chains/fee-bps.ts the number was written out four times — in
// send/fees.ts (EVM accrual), send/bitcoin.ts (fee output), and again in BOTH
// wallet drawers' send views — with nothing connecting them. The duplication
// was structural rather than careless: send/fees.ts imports the database, so a
// client component cannot import the constant from it.
//
// Four copies means changing the rate is a four-file edit where missing one
// leaves a chain quietly charging the old number, and no type error anywhere.
// The UI string was a fifth copy: "0.5% platform fee" was hardcoded next to the
// arithmetic that used the constant, so the label could disagree with what was
// actually taken. It is derived now.

const FILES = [
    "lib/chains/send/fees.ts",
    "lib/chains/send/bitcoin.ts",
    "components/wallet/wallet-drawer2/views/send/send-view.tsx",
    "components/wallet/wallet-drawer/views/send/send-view.tsx",
];

describe("platform fee rate", () => {
    test("is 0.85% across every chain", () => {
        expect(PLATFORM_FEE_BPS).toBe(85);
        expect(PLATFORM_FEE_BPS_BIG).toBe(BigInt(85));
    });

    test("no send path redefines the rate with its own literal", () => {
        for (const file of FILES) {
            const src = readFileSync(file, "utf8");
            // A local `FEE_BPS = <number>` is the shape every old copy had.
            const redefinition = /(?:const|let)\s+\w*FEE_BPS\w*\s*(?::[^=]+)?=\s*(?:BigInt\()?\d/.exec(src);
            expect(redefinition?.[0] ?? null).toBeNull();
        }
    });

    test("the fee shown to the user is derived, not typed out", () => {
        for (const file of FILES.filter((f) => f.endsWith(".tsx"))) {
            const src = readFileSync(file, "utf8");
            // A literal percentage next to "platform fee" is a label that can
            // disagree with the amount actually charged.
            expect(/\d+(?:\.\d+)?%\s*platform fee/.test(src)).toBe(false);
        }
    });
});
