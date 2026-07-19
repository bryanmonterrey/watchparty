import { describe, expect, test } from "bun:test";
import { XP_AWARDS, levelForXp, xpForLevel, xpProgress } from "../lib/xp";
import { QUESTS } from "../lib/quests";

// The curve is FROZEN (lib/xp.ts) — these tests pin it. If one fails, you
// changed the economy: every existing user silently re-levels.

describe("xp curve", () => {
    test("known thresholds", () => {
        expect(xpForLevel(1)).toBe(0);
        expect(xpForLevel(2)).toBe(100);
        expect(xpForLevel(3)).toBe(300);
        expect(xpForLevel(5)).toBe(1000);
        expect(xpForLevel(10)).toBe(4500);
        expect(xpForLevel(20)).toBe(19000);
        expect(xpForLevel(50)).toBe(122500);
    });

    test("levelForXp inverts xpForLevel exactly at and around thresholds", () => {
        for (let level = 1; level <= 200; level++) {
            const threshold = xpForLevel(level);
            expect(levelForXp(threshold)).toBe(level);
            if (threshold > 0) expect(levelForXp(threshold - 1)).toBe(level - 1);
            expect(levelForXp(threshold + 1)).toBe(level);
        }
    });

    test("never below level 1, even for garbage", () => {
        expect(levelForXp(0)).toBe(1);
        expect(levelForXp(-500)).toBe(1);
    });

    test("monotonic over a dense range", () => {
        let prev = 1;
        for (let xp = 0; xp <= 50_000; xp += 7) {
            const l = levelForXp(xp);
            expect(l).toBeGreaterThanOrEqual(prev);
            prev = l;
        }
    });

    test("xpProgress stays in bounds and is consistent", () => {
        for (const xp of [0, 1, 99, 100, 101, 999, 1000, 4499, 4500, 123456]) {
            const p = xpProgress(xp);
            expect(p.level).toBe(levelForXp(xp));
            expect(p.inLevel).toBeGreaterThanOrEqual(0);
            expect(p.forNext).toBeGreaterThan(0);
            expect(p.inLevel).toBeLessThan(p.forNext);
            expect(p.pct).toBeGreaterThanOrEqual(0);
            expect(p.pct).toBeLessThanOrEqual(100);
        }
    });
});

describe("award catalog", () => {
    test("every award pays a positive amount with a positive daily cap", () => {
        for (const [kind, cfg] of Object.entries(XP_AWARDS)) {
            if (kind === "quest_completed") continue; // amount comes per-quest via override
            expect(cfg.amount).toBeGreaterThan(0);
            expect(cfg.maxPerDay).toBeGreaterThan(0);
        }
    });

    test("no single kind can pay more than 1500 XP/day (referral-farm guard)", () => {
        for (const [kind, cfg] of Object.entries(XP_AWARDS)) {
            if (kind.startsWith("callout_")) continue; // bounded by the 6h cooldown, not the cap
            expect(cfg.amount * cfg.maxPerDay).toBeLessThanOrEqual(1500);
        }
    });

    test("quests reference real targets and rewards", () => {
        const ids = new Set<string>();
        for (const q of QUESTS) {
            expect(q.target).toBeGreaterThan(0);
            expect(q.xpReward).toBeGreaterThan(0);
            expect(ids.has(q.id)).toBe(false);
            ids.add(q.id);
        }
    });
});
