import { describe, expect, test } from "bun:test";

// From ./config, not ./signals — the latter is `server-only` and the shim
// throws when a test imports it. signals.ts re-exports ACTION from here.
import { ACTION, PHOENIX_NUM_ACTIONS } from "@/lib/feed-ranker/config";

/**
 * Phoenix action indices must land inside the checkpoint's logit slots.
 *
 * The ranker emits one probability per slot (`num_actions`, currently 19), and
 * the service drops anything outside that range with a bare bounds check:
 *
 *     if 0 <= int(idx) < num_actions:   # else the signal vanishes
 *
 * No error, no log, no type change — the signal is simply never seen by the
 * model. `ACTION.NEGATIVE` was 20 for the life of the feature, so every
 * "not interested" a user sent was silently discarded while the mutation
 * returned success and the row sat in `feed_signals` looking correct.
 *
 * Nothing else catches this. tsc sees a number, the insert succeeds, the
 * service returns 200, and the feed still ranks — just without the signal. So
 * the bound is asserted here.
 */

// Logged actions: written by recordSignal/accumulateDwell and read back into
// the history sequence, so each must be a real slot the model predicts.
const LOGGED: Array<[string, number]> = [
    ["FAVORITE", ACTION.FAVORITE],
    ["REPLY", ACTION.REPLY],
    ["QUOTE", ACTION.QUOTE],
    ["REPOST", ACTION.REPOST],
    ["DWELL", ACTION.DWELL],
    ["VIDEO_VIEW", ACTION.VIDEO_VIEW],
    ["NEGATIVE", ACTION.NEGATIVE],
];

describe("Phoenix action indices", () => {
    test.each(LOGGED)("%s is inside the model's logit slots", (_name, idx) => {
        expect(Number.isInteger(idx)).toBe(true);
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(PHOENIX_NUM_ACTIONS);
    });

    test("indices are distinct — a collision merges two signals", () => {
        const values = LOGGED.map(([, idx]) => idx);
        expect(new Set(values).size).toBe(values.length);
    });

    test("NEGATIVE is 17, the proto's CLIENT_TWEET_NOT_INTERESTED_IN", () => {
        // Was 20 (out of range). history.ts remaps legacy 20-rows to this, so
        // moving it again silently strands every row already written.
        expect(ACTION.NEGATIVE).toBe(17);
    });

    test("TRADE is reserved OUT of range on purpose, and unlogged", () => {
        // Deliberately parked past the upstream ActionName enum (which runs to
        // 60+) so it cannot collide if it is ever wired up. Being out of range
        // is only safe while nothing writes it — if that changes, it needs a
        // real slot and a retrained head, not just a smaller number.
        expect(ACTION.TRADE).toBeGreaterThan(60);
        expect(LOGGED.some(([, idx]) => idx === ACTION.TRADE)).toBe(false);
    });
});
