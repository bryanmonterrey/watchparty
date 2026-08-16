"use client";

import type { TokenStatus } from "./types";

const COLUMN_LABELS: Record<TokenStatus, string> = {
  new: "New",
  migrating: "Migrating",
  migrated: "Migrated",
};

export interface TokenColumnHeaderProps {
  status: TokenStatus;
  tokensCount: number;
}

// Label + count only. The filter trigger used to live here, which meant three
// identical buttons opening ONE dialog whose filters have always applied to the
// whole board (`applyMemescopeFilters` runs over every column) — so each button
// implied a per-column narrowing that did not exist. It is now a single control
// in the toolbar, beside the chain picker.
export function TokenColumnHeader({ status, tokensCount }: TokenColumnHeaderProps) {
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
    </div>
  );
}
