"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, Dollar01Icon, Globe02Icon, Tick02Icon, UserGroup02Icon } from "@hugeicons/core-free-icons";
import type { ColumnDef } from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { SOL_WSOL } from "@/hooks/use-quick-buy";
import { createDataTableColumnHelper, type DataTableFeatures } from "@/components/ui/data-table";
import { CoinImage } from "@/components/coins/coin-image";
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
            <CoinImage src={token.imageUrl} alt={token.symbol} coin={`${token.symbol}:${token.tokenAddress || token.id}`} className="size-full" />
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

/* The row's buy control: the CREATOR COIN button's language (twitter2 on its
   own tint — an invitation, not a status; see PILL_CREATE in
   profile/creator-coin-action) split into a segmented group. The resting tint
   is the creator coin's /10; hover lifts to /20 rather than its /15, per the
   owner — a board row is scanned at a glance, so the pressed target wants the
   fuller step. Same colour family either way, and hover still composites
   LIGHTER than rest (the hover-lighter guard).

   `Buy` is the group's LABEL, not a fourth button: the amounts are the
   actions, so there is no ambiguity about what an unlabelled press would
   spend. The dividers are deliberately short — a hairline the height of the
   text rather than the full pill — so the segments read as one control
   instead of three buttons jammed together.

   PILL, so rounded-full and NO <Squircle> — both the documented pill rule and
   the reason the board's hover wash lost its clip-path: 31 rows of these
   would put the mounts straight back. */
const BUY_AMOUNTS_USD = [25, 50, 100] as const;

/** Dollar-denominated quick buy, paid in SOL. EVM rows open the coin page. */
function BuyCell({
    token,
    quickBuy,
    buying,
}: {
    token: TradeToken;
    quickBuy: (t: TradeToken, payWith?: { mint: string; decimals: number; symbol: string; amount: number }) => Promise<"done" | "no-wallet" | "no-mint" | "failed">;
    buying: boolean;
}) {
    const router = useRouter();
    const utils = trpc.useUtils();
    // Which amount is in flight, so the pressed segment can say so while the
    // other two simply go quiet.
    const [pending, setPending] = useState<number | null>(null);

    // The swap engine only speaks Solana: external Solana coins buy by mint like
    // any in-house coin, EVM rows just open their coin page.
    if (token.external && token.chain !== "solana") return null;

    const handleBuy = (usd: number) => async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (buying) return;
        setPending(usd);
        try {
            // Priced at press time rather than held in a live query: the board
            // is public and this is the only moment the number matters, so a
            // signed-out visitor never pays for a price they cannot spend.
            // The procedure is cached server-side, so repeat presses are free.
            const solPrice = await utils.wallet.getSolPrice.fetch().catch(() => null);
            const result = await quickBuy(
                token,
                solPrice && solPrice > 0
                    ? { mint: SOL_WSOL, decimals: 9, symbol: "SOL", amount: usd / solPrice }
                    : undefined,
            );
            if (result === "no-mint") {
                router.push(token.external ? `/coin/${token.chain}/${token.tokenAddress}` : `/${token.tokenAddress || token.id}`);
            }
        } finally {
            setPending(null);
        }
    };

    return (
        <div
            className={cn(
                "ml-auto flex h-11 w-fit items-center overflow-hidden rounded-full bg-twitter2/10 text-twitter2 transition-opacity",
                buying && "opacity-60",
            )}
        >
            {/* The dollar mark IS the label (owner call): it says what the
                numbers are denominated in, in the width a word would cost —
                and the group has to fit its cell, which "Buy $25 $50 $100"
                did not (measured 248px in a 232px column: clipped at $10,
                and the spill sat outside the row's hover squircle). */}
            <span className="flex items-center pl-3.5 pr-2.5" aria-hidden>
                <HugeiconsIcon icon={Dollar01Icon} className="size-4" strokeWidth={2.5} />
            </span>
            {BUY_AMOUNTS_USD.map((usd) => (
                <span key={usd} className="flex h-full items-center">
                    {/* Short divider: text-height, not pill-height. */}
                    <span aria-hidden className="h-4 w-px shrink-0 bg-twitter2/25" />
                    <button
                        type="button"
                        onClick={handleBuy(usd)}
                        disabled={buying}
                        aria-label={`Buy $${usd} of ${token.symbol ?? "this coin"}`}
                        className="flex h-full cursor-pointer items-center px-3.5 text-[15px] font-bold tabular-nums transition-colors hover:bg-twitter2/20 disabled:cursor-default"
                    >
                        {pending === usd ? "…" : usd}
                    </button>
                </span>
            ))}
        </div>
    );
}

const helper = createDataTableColumnHelper<TradeToken>();

/**
 * The board's columns. Ids match the board's sort keys — `marketCap`,
 * `price`, `change` — because the header IS the sort control now
 * that the sort dropdown is hidden, and `TradeDiscover` reads
 * `sorting[0].id` straight back as its sort key.
 */
export function buildTradeColumns({
    timeframe,
    quickBuy,
    buyingId,
}: {
    timeframe: Timeframe;
    quickBuy: (t: TradeToken, payWith?: { mint: string; decimals: number; symbol: string; amount: number }) => Promise<"done" | "no-wallet" | "no-mint" | "failed">;
    buyingId: string | null;
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
            meta: { width: "18%" },
            /* The value alone. Its sub-line used to carry the % change, and
               when that moved to its own column the slot briefly held the
               words "Market cap" — a label repeating the header two rows up
               rather than telling you anything (owner: "isn't data supposed to
               be on market cap?"). Nothing true is left to put there, so the
               number stands on its own. */
            cell: ({ row }) => (
                <p className="text-[15px] font-bold tabular-nums tracking-tight text-white">
                    {formatUsd(row.original.marketCap)}
                </p>
            ),
        }),
        helper.accessor("priceUsd", {
            id: "price",
            header: "Price",
            sortDescFirst: true,
            meta: { width: "16%" },
            /* Same rule as market cap: the header already says "Price". */
            cell: ({ row }) => (
                <p className="text-[15px] font-semibold tabular-nums text-zinc-200">
                    {formatPrice(row.original.priceUsd)}
                </p>
            ),
        }),
        /* The move off the market-cap cell's sub-line: change is what the
           board is scanned for, so it gets a column of its own and the
           timeframe it belongs to as its label — the same value the pills at
           the top select (changeFor reads the 5m/1h/6h/24h field). */
        helper.accessor((t) => changeFor(t, timeframe), {
            id: "change",
            header: "Change",
            sortDescFirst: true,
            meta: { width: "13%" },
            cell: ({ row }) => {
                const change = changeFor(row.original, timeframe);
                const up = change >= 0;
                return (
                    <>
                        <p
                            className={cn(
                                "text-[15px] font-bold tabular-nums tracking-tight",
                                up ? "text-lantern" : "text-pastelred",
                            )}
                        >
                            {up ? "+" : ""}
                            {change.toFixed(1)}%
                        </p>
                        <p className="mt-0.5 text-[12px] font-medium text-zinc-600">{timeframe}</p>
                    </>
                );
            },
        }),
        helper.display({
            id: "action",
            header: "Action",
            enableSorting: false,
            /* 232px = the group's 194 plus the cell's own 16px padding on each
               side. A 200px column looked like it fit (194 < 200) but its
               CONTENT box is only 168, so the group spilled past the cell,
               past the table, and into the strip beside the sticky header —
               which is what showed through while scrolling. */
            meta: { align: "right", width: "232px" },
            cell: ({ row }) => (
                <BuyCell
                    token={row.original}
                    quickBuy={quickBuy}
                    buying={buyingId === row.original.id}
                />
            ),
        }),
    ];
}
