"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

// Shared row for trade surfaces (profile Trades tab + the live trades feed).

export interface TradeRowData {
    id: string;
    side: "buy" | "sell";
    mint: string;
    usdValue: number | null;
    confirmedAt: Date | string | null;
    source: string;
    token: { ticker: string; name: string; imageUrl: string | null } | null;
    trader?: { name: string; username: string | null; avatar_url: string | null; level: number };
}

export function TradeRow({ t }: { t: TradeRowData }) {
    const label = t.token?.ticker ? `$${t.token.ticker}` : `${t.mint.slice(0, 4)}…${t.mint.slice(-4)}`;
    return (
        <div className="flex items-center gap-3 rounded-[20px] bg-panel px-4 py-3">
            {t.trader && (
                <Link href={`/${t.trader.username ?? ""}`} className="flex items-center gap-2.5 min-w-0 group shrink-0">
                    <Avatar className="size-8 border border-zinc-700/50">
                        <AvatarImage src={t.trader.avatar_url || undefined} />
                        <AvatarFallback className="bg-zinc-800" />
                    </Avatar>
                    <span className="hidden sm:flex items-center gap-1.5">
                        <span className="truncate text-sm font-bold text-white group-hover:underline">{t.trader.name}</span>
                        <span className="font-pixel text-[10px] leading-none text-lantern">LV {t.trader.level}</span>
                    </span>
                </Link>
            )}
            <span className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wider",
                t.side === "buy" ? "bg-lantern/10 text-lantern" : "bg-pastelred/10 text-pastelred",
            )}>
                {t.side}
            </span>
            <Link href={`/${t.mint}`} className="flex items-center gap-2 min-w-0 group">
                <div className="size-7 overflow-hidden rounded-lg border border-zinc-700/40 bg-zinc-800 shrink-0">
                    {t.token?.imageUrl && <img src={t.token.imageUrl} alt={t.token.name} className="size-full object-cover" />}
                </div>
                <span className="truncate text-sm font-bold text-white group-hover:underline">{label}</span>
            </Link>
            <div className="ml-auto flex items-center gap-3 shrink-0 text-right">
                <span className="text-sm font-bold text-white tabular-nums">
                    {t.usdValue != null ? `$${Math.round(t.usdValue).toLocaleString()}` : "—"}
                </span>
                <span className="hidden md:block w-16 text-xs font-medium text-zinc-500">
                    {t.confirmedAt ? formatDistanceToNow(new Date(t.confirmedAt), { addSuffix: false }) : ""}
                </span>
                {t.side === "buy" && (
                    <Link
                        href={`/${t.mint}`}
                        className="rounded-full bg-lantern/10 px-3 py-1.5 text-xs font-bold text-lantern transition-colors hover:bg-lantern/20"
                    >
                        Copy
                    </Link>
                )}
            </div>
        </div>
    );
}
