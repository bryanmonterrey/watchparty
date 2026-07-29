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
    <div className="relative w-full h-[52px] flex items-center justify-between pl-4 pr-1 rounded-t-xl transition-colors duration-300">
      <div className="flex items-center gap-3">
        <span className="text-lg font-bold text-zinc-400">
          {COLUMN_LABELS[status]}
        </span>
        <span className="text-sm font-bold text-zinc-500 bg-soft-gray-10 px-4.5 py-1.5 rounded-full">
          {tokensCount}
        </span>
      </div>
      <div className="flex items-center rounded-full backdrop-blur-sm">
        <button className="cursor-pointer text-zinc-400 border-none outline-none hover:text-flexwhite bg-soft-gray-10 transition-colors p-2 rounded-full hover:bg-soft-gray-15">
          <Menu2Icon className="size-6" />
        </button>
      </div>
    </div>
  );
}
