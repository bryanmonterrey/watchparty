import { describe, expect, test } from "bun:test";
import { humanToBaseUnits } from "@/lib/wallet/base-units";

// The money-precision function: every EVM swap amount passes through it.
// The properties that matter: exact BigInt math (no float drift), truncation
// (never send MORE than typed), and hard rejection of malformed input.

describe("humanToBaseUnits", () => {
    test("whole and fractional amounts, 18 decimals", () => {
        expect(humanToBaseUnits("1", 18)).toBe("1000000000000000000");
        expect(humanToBaseUnits("0.25", 18)).toBe("250000000000000000");
        expect(humanToBaseUnits("1.000000000000000001", 18)).toBe("1000000000000000001");
    });

    test("exact beyond Number.MAX_SAFE_INTEGER — the reason this is BigInt", () => {
        // 1e6 tokens at 18 decimals = 1e24 base units; float math corrupts this.
        expect(humanToBaseUnits("1000000", 18)).toBe("1000000000000000000000000");
        expect(humanToBaseUnits("123456789.123456789123456789", 18)).toBe("123456789123456789123456789");
    });

    test("truncates excess precision — never rounds up", () => {
        expect(humanToBaseUnits("0.1234567", 6)).toBe("123456");
        expect(humanToBaseUnits("0.9999999", 6)).toBe("999999");
    });

    test("six-decimal tokens (USDC-shaped)", () => {
        expect(humanToBaseUnits("12.5", 6)).toBe("12500000");
        expect(humanToBaseUnits("0.000001", 6)).toBe("1");
    });

    test("zero decimals", () => {
        expect(humanToBaseUnits("42", 0)).toBe("42");
        expect(humanToBaseUnits("42.9", 0)).toBe("42");
    });

    test("zero and dust", () => {
        expect(humanToBaseUnits("0", 18)).toBe("0");
        expect(humanToBaseUnits("0.0", 18)).toBe("0");
        // Below one base unit truncates to zero — caller rejects zero amounts.
        expect(humanToBaseUnits("0.0000001", 6)).toBe("0");
    });

    test("whitespace tolerated, garbage rejected", () => {
        expect(humanToBaseUnits(" 1.5 ", 6)).toBe("1500000");
        for (const bad of ["", ".", "1.", ".5", "1,5", "1e5", "-1", "abc", "0x10", "1.2.3", "∞"]) {
            expect(() => humanToBaseUnits(bad, 6)).toThrow(RangeError);
        }
    });
});
