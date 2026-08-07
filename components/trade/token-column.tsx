"use client";

import { cn } from "@/lib/utils";
import { Squircle } from "@/components/ui/squircle";
import { TokenRow } from "./token-row";
import type { TradeToken, TokenStatus } from "./types";

interface TokenColumnProps {
  status: TokenStatus;
  tokens: TradeToken[];
  loading?: boolean;
  className?: string;
  quickBuy?: (t: TradeToken) => Promise<"done" | "no-wallet" | "no-mint" | "failed">;
  buyingId?: string | null;
  amountSol?: number;
  /** Height of the board's sticky header — the column's top pusher must match
   *  or rows start underneath the glass. Owned by trade-feed.tsx. */
  headerPushPx?: number;
}

const EMPTY_COPY: Record<TokenStatus, { title: string; hint: string }> = {
  new: { title: "No fresh launches yet", hint: "Brand-new coins land here first." },
  migrating: { title: "Nothing bonding right now", hint: "Coins close to migration show up here." },
  migrated: { title: "No graduates yet", hint: "Coins that complete their curve appear here." },
};

export function TokenColumn({ status, tokens, loading, className, quickBuy, buyingId, amountSol, headerPushPx = 116 }: TokenColumnProps) {
  return (
    <div className={cn("h-full overflow-y-auto scroll-smooth hidden-scrollbar mt-2", className)}>
      {/* Pushes initial content below the fixed header; scrolls away as you go up */}
      <div className="shrink-0" style={{ height: headerPushPx }} />
      {/* No fill: the panel's bg-panel/50 top edge read as a hairline under
          the column labels, and these boards are borderless now (same call as
          the coin page's tables). Rows carry their own hover fills. */}
      <Squircle asChild radius={10} autoEffects={false}>
        <div>
          {loading ? (
            <div className="flex flex-col py-1">
              {Array.from({ length: 8 }).map((_, i) => (
                <TokenRowSkeleton key={i} />
              ))}
            </div>
          ) : tokens.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1 px-6 py-20 text-center">
              <p className="text-sm font-bold text-zinc-400">{EMPTY_COPY[status].title}</p>
              <p className="text-xs text-zinc-600">{EMPTY_COPY[status].hint}</p>
            </div>
          ) : (
            <div className="flex flex-col py-1">
              {tokens.map((token) => (
                <TokenRow
                  key={token.id}
                  token={token}
                  quickBuy={quickBuy}
                  buying={buyingId === token.id}
                  amountSol={amountSol}
                />
              ))}
            </div>
          )}
        </div>
      </Squircle>
    </div>
  );
}

// Mirrors TokenRow's real geometry (48px ring avatar, three text lines, Buy
// pill) so the swap from skeleton → data doesn't jump.
function TokenRowSkeleton() {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-3">
      <div className="size-12 shrink-0 overflow-hidden rounded-[14px]"><div className="size-full shimmer-skeleton" /></div>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="h-3.5 w-2/3 max-w-[140px] overflow-hidden rounded-full"><div className="size-full shimmer-skeleton" /></div>
        <div className="h-3 w-1/2 max-w-[110px] overflow-hidden rounded-full"><div className="size-full shimmer-skeleton" /></div>
        <div className="h-3 w-3/5 max-w-[120px] overflow-hidden rounded-full"><div className="size-full shimmer-skeleton" /></div>
      </div>
      <div className="h-9 w-[72px] overflow-hidden rounded-full"><div className="size-full shimmer-skeleton" /></div>
    </div>
  );
}
