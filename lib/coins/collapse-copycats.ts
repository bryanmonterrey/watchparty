/**
 * One row per coin identity.
 *
 * Pump.fun copycats relaunch the same symbol+name every few minutes, so a board
 * fills with near-identical rows — reported 2026-08-07 as "the same coin listed
 * 3-4 times", and it is worse than it sounds. Measured on the live solana
 * trending board 2026-08-12:
 *
 *     xst|xst                 x9      bot|grok bot            x7
 *     momo|momocoin           x6      sndk|sandisk corporation x6
 *     mario64|mario64         x4      xst|xsolutai            x4
 *
 * 36 rows for 6 actual coins. `XST` alone was 10% of a 131-row board.
 *
 * ## Identity is symbol AND name
 *
 * Not the symbol alone: two coins legitimately sharing a ticker but named
 * differently are different coins, and collapsing them would hide a real one.
 * `xst|xst` and `xst|xsolutai` above are exactly that case — same ticker, two
 * distinct coins, and both survive.
 *
 * ## Why it lives here
 *
 * It was written for the /trade board and lived in `components/trade/`, so the
 * trending board — a different surface with the same problem — never got it.
 * Generic over the fields it actually reads, so any row shape can use it.
 */

export interface Copycat {
    symbol: string;
    name?: string | null;
    volume?: number | null;
    marketCap?: number | null;
    /** In-house launches beat external rows of the same identity: they carry
     *  creator, live and curve state the external row does not have. */
    external?: boolean;
}

export function collapseCopycats<T extends Copycat>(list: readonly T[]): T[] {
    if (list.length < 2) return [...list];

    const keyOf = (t: T) =>
        `${t.symbol.replace(/^\$/, "").toLowerCase()}|${(t.name ?? "").trim().toLowerCase()}`;

    const best = new Map<string, T>();
    for (const t of list) {
        const key = keyOf(t);
        const cur = best.get(key);
        if (!cur) {
            best.set(key, t);
            continue;
        }
        const curInHouse = !cur.external;
        const tInHouse = !t.external;
        if (curInHouse !== tInHouse) {
            if (tInHouse) best.set(key, t);
            continue;
        }
        // Keep the copy traders are actually in.
        const better =
            (t.volume || 0) > (cur.volume || 0) ||
            ((t.volume || 0) === (cur.volume || 0) && (t.marketCap || 0) > (cur.marketCap || 0));
        if (better) best.set(key, t);
    }

    // Filter rather than rebuild, so survivors keep their original positions —
    // the caller has already sorted, and re-emitting from the Map would quietly
    // reorder the board.
    return list.filter((t) => best.get(keyOf(t)) === t);
}
