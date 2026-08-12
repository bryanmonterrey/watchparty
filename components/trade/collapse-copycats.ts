// Moved to lib/coins/collapse-copycats.ts so the TRENDING board can use it too
// — it lived here, under components/trade/, which is exactly why the trending
// board never got it despite having the same problem (36 rows for 6 coins).
//
// Re-exported rather than updating every import in one go: this file is small,
// and a re-export keeps the move reviewable.
export { collapseCopycats, type Copycat } from "@/lib/coins/collapse-copycats";
