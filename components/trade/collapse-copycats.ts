import type { TradeToken } from "./types";

// One row per coin name. Pump.fun copycats relaunch the same symbol+name every
// few minutes, and 3–4 near-identical rows read as a bug (reported 2026-08-07:
// "the same coin listed 3-4 times"). Collapse keeps the strongest copy — the
// one traders are actually in — and preserves the list's existing order.
//
// Identity is symbol+name together: two coins legitimately sharing a ticker
// but named differently stay separate. An in-house launch always beats an
// external row of the same identity (it carries creator/live/curve state).
export function collapseCopycats(list: TradeToken[]): TradeToken[] {
    if (list.length < 2) return list;

    const keyOf = (t: TradeToken) =>
        `${t.symbol.replace(/^\$/, "").toLowerCase()}|${(t.name ?? "").trim().toLowerCase()}`;

    const best = new Map<string, TradeToken>();
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
        const better =
            (t.volume || 0) > (cur.volume || 0) ||
            ((t.volume || 0) === (cur.volume || 0) && (t.marketCap || 0) > (cur.marketCap || 0));
        if (better) best.set(key, t);
    }

    // Filter rather than rebuild, so survivors keep their original positions.
    return list.filter((t) => best.get(keyOf(t)) === t);
}
