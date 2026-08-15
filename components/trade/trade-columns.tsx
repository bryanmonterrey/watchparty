"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, Globe02Icon, Tick02Icon, UserGroup02Icon } from "@hugeicons/core-free-icons";
import type { ColumnDef } from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { SolanaIcon } from "@/components/icons";
import { createDataTableColumnHelper, type DataTableFeatures } from "@/components/ui/data-table";
import type { TradeToken } from "./types";

// The /trade board's columns. Split out of `trade-discover` because they are
// the one part of it that another board (memescope, a profile's coins) can
// reuse verbatim — and because the cell renderers carry their own state
// (address copy) and so have to be components, not inline closures.

/** Which window the %-change and volume cells report. */
export type Timeframe = "5m" | "1h" | "24h";
export const TIMEFRAMES: Timeframe[] = ["5m", "1h", "24h"];

export function changeFor(t: TradeToken, tf: Timeframe): number {
    if (tf === "5m") return t.changePercent5m ?? t.changePercent;
    if (tf === "1h") return t.changePercent1h ?? t.changePercent;
    return t.changePercent;
}

export function volumeFor(t: TradeToken, tf: Timeframe): number {
    if (tf === "5m") return t.volume5m ?? t.volume;
    if (tf === "1h") return t.volume1h ?? t.volume;
    return t.volume;
}

export function formatUsd(value: number): string {
    if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
    return `$${value.toFixed(2)}`;
}

export function formatPrice(value: number): string {
    if (value === 0) return "—";
    if (value >= 1) return `$${value.toFixed(2)}`;
    if (value >= 0.001) return `$${value.toFixed(4)}`;
    // sub-milli prices: show leading-zero count notation ($0.0₅123)
    const s = value.toFixed(12);
    const m = s.match(/^0\.(0*)(\d{1,3})/);
    if (!m) return `$${value.toPrecision(2)}`;
    return `$0.0${String.fromCharCode(0x2080 + m[1].length)}${m[2]}`;
}

export function formatCount(count: number): string {
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return String(count);
}

function XIcon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.737-8.835L1.254 2.25H8.08l4.254 5.622 5.91-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
    );
}

// Plain tile — the bonding-progress ring is gone by request, in every state.
function TokenAvatar({ token }: { token: TradeToken }) {
    return (
        <div className="size-12 shrink-0 overflow-hidden rounded-[14px] bg-zinc-800">
            {token.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={token.imageUrl} alt={token.symbol} className="size-full object-cover" />
            ) : null}
        </div>
    );
}

/** Coin identity: avatar, ticker, name, copy-address, live badge and socials. */
function CoinCell({ token }: { token: TradeToken }) {
    const router = useRouter();
    const [copied, setCopied] = useState(false);
    const slug = token.tokenAddress || token.id;

    const copy = (e: React.MouseEvent) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(token.tokenAddress || token.id);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
    };

    const openSocial = (e: React.MouseEvent, url?: string) => {
        e.stopPropagation();
        if (url) window.open(url, "_blank", "noopener,noreferrer");
    };

    return (
        <div className="flex min-w-0 items-center gap-3">
            <TokenAvatar token={token} />
            <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                    <span className="truncate text-[16px] font-bold tracking-tight text-white">
                        {token.symbol.startsWith("$") ? token.symbol : `$${token.symbol}`}
                    </span>
                    <span className="hidden truncate text-[14px] font-medium text-zinc-500 sm:inline">{token.name}</span>
                    <button
                        onClick={copy}
                        aria-label="Copy coin address"
                        className="shrink-0 cursor-pointer text-zinc-600 transition-colors hover:text-zinc-300"
                    >
                        {copied ? (
                            <HugeiconsIcon icon={Tick02Icon} className="size-3 text-white" strokeWidth={2.5} />
                        ) : (
                            <HugeiconsIcon icon={Copy01Icon} className="size-3" strokeWidth={2} />
                        )}
                    </button>
                </div>
                <div className="mt-1 flex items-center gap-2">
                    {token.creatorIsLive && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/${token.creatorUsername ?? slug}`);
                            }}
                            aria-label="Watch the creator's live stream"
                            className="flex cursor-pointer items-center gap-1 rounded-full bg-pastelred/15 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-pastelred transition-colors hover:bg-pastelred/25"
                        >
                            <span className="size-1.5 animate-pulse rounded-full bg-pastelred" />
                            LIVE{token.liveViewerCount > 0 ? ` · ${formatCount(token.liveViewerCount)}` : ""}
                        </button>
                    )}
                    <span className="text-[12px] font-medium text-zinc-500">{token.timeAgo}</span>
                    {token.hasSocials.twitter && (
                        <button
                            onClick={(e) => openSocial(e, token.hasSocials.twitter)}
                            aria-label="X profile"
                            className="cursor-pointer text-zinc-600 transition-colors hover:text-white"
                        >
                            <XIcon className="size-[11px]" />
                        </button>
                    )}
                    {token.hasSocials.website && (
                        <button
                            onClick={(e) => openSocial(e, token.hasSocials.website)}
                            aria-label="Website"
                            className="cursor-pointer text-zinc-600 transition-colors hover:text-white"
                        >
                            <HugeiconsIcon icon={Globe02Icon} className="size-3" strokeWidth={2} />
                        </button>
                    )}
                    <span className="flex items-center gap-1 text-[12px] font-medium text-zinc-500 md:hidden">
                        <HugeiconsIcon icon={UserGroup02Icon} className="size-[11px]" strokeWidth={2} />
                        {formatCount(token.holderCount)}
                    </span>
                </div>
            </div>
        </div>
    );
}

/** Preset-amount buy, in place. EVM rows open the coin page instead. */
function BuyCell({
    token,
    quickBuy,
    buying,
    amountSol,
}: {
    token: TradeToken;
    quickBuy: (t: TradeToken) => Promise<"done" | "no-wallet" | "no-mint" | "failed">;
    buying: boolean;
    amountSol: number;
}) {
    const router = useRouter();
    // The swap engine only speaks Solana: external Solana coins buy by mint like
    // any in-house coin, EVM rows just open their coin page.
    if (token.external && token.chain !== "solana") return null;

    const handleBuy = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const result = await quickBuy(token);
        if (result === "no-mint") {
            router.push(token.external ? `/coin/${token.chain}/${token.tokenAddress}` : `/${token.tokenAddress || token.id}`);
        }
    };

    return (
        <button
            onClick={handleBuy}
            disabled={buying}
            className="ml-auto flex cursor-pointer items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-[14px] font-bold text-white transition-colors hover:bg-white/20 active:scale-95 disabled:cursor-default disabled:opacity-50"
        >
            <SolanaIcon className="size-3.5" />
            {buying ? "Buying…" : `Buy ${amountSol}`}
        </button>
    );
}

const helper = createDataTableColumnHelper<TradeToken>();

/**
 * The board's columns. Ids match the board's sort keys — `marketCap`,
 * `volume`, `price`, `txCount` — because the header IS the sort control now
 * that the sort dropdown is hidden, and `TradeDiscover` reads
 * `sorting[0].id` straight back as its sort key.
 */
export function buildTradeColumns({
    timeframe,
    quickBuy,
    buyingId,
    amountSol,
}: {
    timeframe: Timeframe;
    quickBuy: (t: TradeToken) => Promise<"done" | "no-wallet" | "no-mint" | "failed">;
    buyingId: string | null;
    amountSol: number;
}): ColumnDef<DataTableFeatures, TradeToken, any>[] {
    return [
        helper.display({
            id: "coin",
            header: "Coin",
            enableSorting: false,
            cell: ({ row }) => <CoinCell token={row.original} />,
        }),
        helper.accessor("marketCap", {
            id: "marketCap",
            header: "Market cap",
            sortDescFirst: true,
            meta: { width: "16%" },
            cell: ({ row }) => {
                const change = changeFor(row.original, timeframe);
                const up = change >= 0;
                return (
                    <>
                        <p className="text-[15px] font-bold tabular-nums tracking-tight text-white">
                            {formatUsd(row.original.marketCap)}
                        </p>
                        <p
                            className={cn(
                                "mt-0.5 text-[13px] font-semibold tabular-nums",
                                up ? "text-lantern" : "text-pastelred",
                            )}
                        >
                            {up ? "+" : ""}
                            {change.toFixed(1)}%
                        </p>
                    </>
                );
            },
        }),
        helper.accessor((t) => volumeFor(t, timeframe), {
            id: "volume",
            header: "Volume",
            sortDescFirst: true,
            meta: { width: "15%" },
            cell: ({ row }) => {
                const vol = volumeFor(row.original, timeframe);
                return (
                    <>
                        <p className="text-[15px] font-semibold tabular-nums text-zinc-200">
                            {vol > 0 ? formatUsd(vol) : "—"}
                        </p>
                        <p className="mt-0.5 text-[12px] font-medium text-zinc-600">{timeframe} vol</p>
                    </>
                );
            },
        }),
        helper.accessor("priceUsd", {
            id: "price",
            header: "Price",
            sortDescFirst: true,
            meta: { width: "15%" },
            cell: ({ row }) => (
                <>
                    <p className="text-[15px] font-semibold tabular-nums text-zinc-200">
                        {formatPrice(row.original.priceUsd)}
                    </p>
                    <p className="mt-0.5 text-[12px] font-medium text-zinc-600">Price</p>
                </>
            ),
        }),
        helper.accessor("txCount", {
            id: "txCount",
            header: "Txns",
            sortDescFirst: true,
            meta: { width: "12%" },
            cell: ({ row }) => (
                <>
                    <p className="text-[15px] font-semibold tabular-nums text-zinc-200">
                        {formatCount(row.original.txCount)}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-[12px] font-medium text-zinc-600">
                        <HugeiconsIcon icon={UserGroup02Icon} className="size-[11px]" strokeWidth={2} />
                        {formatCount(row.original.holderCount)}
                    </p>
                </>
            ),
        }),
        helper.display({
            id: "action",
            header: "Action",
            enableSorting: false,
            meta: { align: "right", width: "140px" },
            cell: ({ row }) => (
                <BuyCell
                    token={row.original}
                    quickBuy={quickBuy}
                    buying={buyingId === row.original.id}
                    amountSol={amountSol}
                />
            ),
        }),
    ];
}
