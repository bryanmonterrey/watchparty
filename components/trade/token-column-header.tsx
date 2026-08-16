"use client";

import type { ReactNode } from "react";
import type { TokenStatus } from "./types";

const COLUMN_LABELS: Record<TokenStatus, string> = {
  new: "New",
  migrating: "Migrating",
  migrated: "Migrated",
};

export interface TokenColumnHeaderProps {
  status: TokenStatus;
  tokensCount: number;
  /** Board-level controls, rendered at this header's right edge. Only the last
   *  column passes them — see the note in trade-feed about why they live in a
   *  column cell rather than a row of their own. */
  right?: ReactNode;
}

// Label + count, plus an optional `right` slot the LAST column uses for the
// board's controls.
//
// Every column used to carry its own filter trigger — three identical buttons
// opening ONE dialog whose filters have always applied to the whole board
// (`applyMemescopeFilters` runs over every column), so each implied a
// per-column narrowing that did not exist. There is one control now, and it
// lives in a column cell so the labels stay in the same full-width grid as the
// columns they sit above.
export function TokenColumnHeader({ status, tokensCount, right }: TokenColumnHeaderProps) {
  return (
    <div className="relative w-full h-[52px] flex items-center justify-between pl-4 pr-1 rounded-t-xl transition-colors duration-300">
      <div className="flex items-center gap-3">
        <span className="text-lg font-bold text-zinc-400">
          {COLUMN_LABELS[status]}
        </span>
        <span className="text-sm font-bold text-zinc-500 bg-soft-gray-10 px-4.5 py-1.5 rounded-full">
          {tokensCount}
        </span>
      </div>
      {right}
    </div>
  );
}
