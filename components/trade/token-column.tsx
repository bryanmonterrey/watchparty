"use client";

import { cn } from "@/lib/utils";
import { TokenRow } from "./token-row";
import type { TradeToken, TokenStatus } from "./types";

interface TokenColumnProps {
  status: TokenStatus;
  tokens: TradeToken[];
  loading?: boolean;
  className?: string;
}

export function TokenColumn({ tokens, loading, className }: TokenColumnProps) {
  return (
    <div className={cn("h-full overflow-y-auto scroll-smooth hidden-scrollbar", className)}>
      {/* Pushes initial content below the fixed header; scrolls away as you go up */}
      <div className="h-[116px] shrink-0" />
      <div className="bg-black/50 rounded-xl">
        {loading ? (
          <div className="flex flex-col gap-px">
            {Array.from({ length: 8 }).map((_, i) => (
              <TokenRowSkeleton key={i} />
            ))}
          </div>
        ) : tokens.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-zinc-700 text-xs font-medium">
            No tokens in this category
          </div>
        ) : (
          <div className="flex flex-col">
            {tokens.map((token) => <TokenRow key={token.id} token={token} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function TokenRowSkeleton() {
  return (
    <div className="flex items-center gap-2.5 px-2.5 py-2.5">
      <div className="size-10 rounded-lg bg-white/5 animate-pulse shrink-0" />
      <div className="flex-1 flex flex-col gap-2">
        <div className="h-3 w-2/3 rounded bg-white/5 animate-pulse" />
        <div className="h-2.5 w-1/2 rounded bg-white/5 animate-pulse" />
      </div>
      <div className="h-3 w-10 rounded bg-white/5 animate-pulse" />
    </div>
  );
}
