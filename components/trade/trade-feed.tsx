"use client";

import { useEffect } from "react";
import { TokenColumn } from "./token-column";
import { TokenColumnHeader } from "./token-column-header";
import { trpc } from "@/lib/trpc/client";
import { getRealtimeClient, authenticateRealtimeClient } from "@/lib/supabase/realtime-client";
import type { TokenStatus, TradeToken } from "./types";

const EMPTY: Record<TokenStatus, TradeToken[]> = { new: [], migrating: [], migrated: [] };

export function TradeFeed() {
  const utils = trpc.useUtils();
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
        <div className="w-full h-[52px] pointer-events-none" />
        <div className="flex-1 w-full grid grid-cols-3 gap-2 px-1">
          <TokenColumnHeader status="new" tokensCount={data.new.length} />
          <TokenColumnHeader status="migrating" tokensCount={data.migrating.length} />
          <TokenColumnHeader status="migrated" tokensCount={data.migrated.length} />
        </div>
      </div>

      <div className="absolute inset-0 grid grid-cols-3 gap-2 px-1 overflow-hidden">
        {(["new", "migrating", "migrated"] as const).map((status) => (
          <TokenColumn
            key={status}
            status={status}
            tokens={data[status]}
            loading={isLoading}
          />
        ))}
      </div>
    </div>
  );
}

export type { TokenStatus };
