"use client";

import { useEffect } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { TokenColumn } from "./token-column";
import { TokenColumnHeader } from "./token-column-header";
import { trpc } from "@/lib/trpc/client";
import { getRealtimeClient, authenticateRealtimeClient } from "@/lib/supabase/realtime-client";
import { GooDropdown } from "@/components/ui/goo-dropdown";
import { SolanaIcon } from "@/components/icons";
import { useQuickBuy, QUICK_BUY_PRESETS } from "@/hooks/use-quick-buy";
import type { TokenStatus, TradeToken } from "./types";

const EMPTY: Record<TokenStatus, TradeToken[]> = { new: [], migrating: [], migrated: [] };

export function TradeFeed() {
  const utils = trpc.useUtils();
  const { quickBuy, buyingId, amountSol, setAmountSol } = useQuickBuy();
  // Read path is cache-only on the server; refetch is a cheap fallback while
  // the realtime push (below) handles instant updates from the stream worker.
  const { data = EMPTY, isLoading } = trpc.trade.getFeed.useQuery(undefined, {
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  // Realtime: the token-stream worker writes cached market data → Postgres
  // change → push to every client. One subscription, no per-user polling.
  useEffect(() => {
    let channel: ReturnType<ReturnType<typeof getRealtimeClient>["channel"]> | null = null;
    let cancelled = false;
    (async () => {
      const client = getRealtimeClient();
      try {
        await authenticateRealtimeClient();
      } catch {
        return; // anon users fall back to the refetch interval
      }
      if (cancelled) return;
      channel = client
        .channel("trade:tokens")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "tokens" },
          () => utils.trade.getFeed.invalidate()
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) getRealtimeClient().removeChannel(channel);
    };
  }, [utils]);

  return (
    <div className="h-full relative" style={{ transform: "translateZ(0)" }}>
      {/* FIXED GLASS HEADER */}
      <div className="sticky w-full top-0 left-0 right-0 z-40 flex items-center justify-center flex-col pt-2 pb-0 space-y-3">
        <div className="absolute inset-0 backdrop-blur-sm bg-black/20 -z-10 pointer-events-none" />
        {/* Quick-buy amount lives LEFT in the spacer row — the app header's
            wallet cluster owns the top-right of the viewport. */}
        <div className="w-full h-[52px] flex items-end px-3 lg:px-4 pointer-events-none">
          <div className="pointer-events-auto">
          <GooDropdown
            align="start"
            width={148}
            gap={8}
            fill="#101011"
            panelRadius={20}
            itemHeight={40}
            triggerAriaLabel="Quick-buy amount"
            triggerClassName="pointer-events-auto flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-white/5 px-3.5 text-[13px] font-bold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
            trigger={
              <>
                <SolanaIcon className="size-3.5" />
                {amountSol}
                <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 text-zinc-500" strokeWidth={2} />
              </>
            }
            items={QUICK_BUY_PRESETS.map((v) => ({
              key: String(v),
              onClick: () => setAmountSol(v),
              className: "justify-between px-3 rounded-full cursor-pointer text-sm font-semibold text-zinc-300 hover:bg-white/5 hover:text-white",
              label: (
                <>
                  {v} SOL
                  {amountSol === v && <HugeiconsIcon icon={Tick02Icon} className="size-4 text-white" strokeWidth={2} />}
                </>
              ),
            }))}
          />
          </div>
        </div>
        <div className="flex-1 w-full grid grid-cols-3 gap-3 px-3 lg:px-4">
          <TokenColumnHeader status="new" tokensCount={data.new.length} />
          <TokenColumnHeader status="migrating" tokensCount={data.migrating.length} />
          <TokenColumnHeader status="migrated" tokensCount={data.migrated.length} />
        </div>
      </div>

      <div className="absolute inset-0 grid grid-cols-3 gap-3 px-3 lg:px-4 overflow-hidden">
        {(["new", "migrating", "migrated"] as const).map((status) => (
          <TokenColumn
            key={status}
            status={status}
            tokens={data[status]}
            loading={isLoading}
            quickBuy={quickBuy}
            buyingId={buyingId}
            amountSol={amountSol}
          />
        ))}
      </div>
    </div>
  );
}

export type { TokenStatus };
