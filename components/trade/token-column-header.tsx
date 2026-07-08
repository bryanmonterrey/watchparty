"use client";

import type { TokenStatus } from "./types";
import { Menu2Icon } from "../icons";


const COLUMN_LABELS: Record<TokenStatus, string> = {
  new: "New",
  migrating: "Migrating",
  migrated: "Migrated",
};

export interface TokenColumnHeaderProps {
  status: TokenStatus;
  tokensCount: number;
}

export function TokenColumnHeader({ status, tokensCount }: TokenColumnHeaderProps) {
  return (
    <div className="relative w-full h-[52px] flex items-center justify-between px-4 rounded-t-xl transition-colors duration-300">
      <div className="flex items-center gap-2">
        <span className="text-lg font-bold text-zinc-200 tracking-tight">
          {COLUMN_LABELS[status]}
        </span>
        <span className="text-sm font-bold text-zinc-500 bg-zinc-800/40 px-2 py-1 rounded-full border border-white/5">
          {tokensCount}
        </span>
      </div>
      <div className="flex items-center rounded-full backdrop-blur-sm">
        <button className="cursor-pointer text-flexwhite/80 hover:text-flexwhite transition-colors p-2.5 rounded-full hover:bg-white/5">
          <Menu2Icon className="size-6" />
        </button>
      </div>
    </div>
  );
}
