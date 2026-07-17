"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import { TradeUpIcon, TradeDownIcon, Wallet01Icon } from "@hugeicons/core-free-icons";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useWalletSigning } from "@/hooks/use-wallet-signing";
import { AnimatedSlider } from "@/components/ui/motion-slider";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PerpsChart } from "@/components/perps/perps-chart";
import { cn } from "@/lib/utils";
import type { Transaction } from "@solana/web3.js";
import type { PerpMarketRow, PerpPositionRow, PerpSymbol, OpenQuote } from "@/lib/perps/flash";

// Perpetuals on Flash Trade — non-custodial, GMX-style: collateral leaves the
// user's wallet at open and returns at close; there is no deposit step.
// The SDK only BUILDS unsigned transactions; Swig wallets submit through
// signAndSubmit (session key / FROST), extension wallets through
// sendTransaction. The SDK (heavy) loads only inside this route via
// await import().
//
// Layout borrows the trading-terminal pattern (market rail / chart /
// order panel) — expressed in watchparty's identity, not Phantom's.

const fmtUsd = (n: number, dp = 2) =>
    n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toFixed(n < 1 ? 4 : dp);

const fmtPrice = (n: number) => {
    if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (n >= 1) return n.toFixed(2);
    if (n >= 0.01) return n.toFixed(4);
    return n.toPrecision(4);
};

/** The wallet address trades come from: Swig custodial first, else extension. */
function useTradeAuthority(): { authority: string | null; isSwig: boolean } {
    const { data: session } = useAuthSession();
    const wallet = useWallet();
    const custodial = session?.user?.wallet_address ?? null;
    if (custodial) return { authority: custodial, isSwig: true };
    return { authority: wallet.publicKey?.toBase58() ?? null, isSwig: false };
}

/** 24h-ago reference prices from Pyth benchmarks (one hourly fetch per market). */
function useDayRefs(markets: PerpMarketRow[]) {
    const [refs, setRefs] = useState<Record<string, number>>({});
    const tickers = useMemo(() => markets.map((m) => m.pythTicker).join(","), [markets]);

    useEffect(() => {
        if (!tickers) return;
        let alive = true;
        const load = async () => {
            const to = Math.floor(Date.now() / 1000);
            const from = to - 25 * 3600;
            const entries = await Promise.all(
                tickers.split(",").map(async (ticker) => {
                    try {
                        const res = await fetch(
                            `https://benchmarks.pyth.network/v1/shims/tradingview/history` +
                            `?symbol=${encodeURIComponent(ticker)}&resolution=60&from=${from}&to=${to}`,
                        );
                        const d = await res.json();
                        return [ticker, d.s === "ok" && d.o.length ? d.o[0] : 0] as const;
                    } catch {
                        return [ticker, 0] as const;
                    }
                }),
            );
            if (alive) setRefs(Object.fromEntries(entries));
        };
        load();
        const timer = setInterval(load, 120_000);
        return () => {
            alive = false;
            clearInterval(timer);
        };
    }, [tickers]);

    return refs;
}

export function PerpsView() {
    const { connection } = useConnection();
    const wallet = useWallet();
    const { data: session } = useAuthSession();
    const { signAndSubmit } = useWalletSigning();
    const { authority, isSwig } = useTradeAuthority();

    const [markets, setMarkets] = useState<PerpMarketRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<PerpSymbol>("SOL");
    const [positions, setPositions] = useState<PerpPositionRow[]>([]);
    const [balance, setBalance] = useState(0);
    // Feeds the perps referral sweep — which users trade perps through us.
    const recordPerpsAccount = trpc.trade.recordDriftAccount.useMutation();

    const dayRefs = useDayRefs(markets);
    const market = markets.find((m) => m.symbol === selected) ?? null;
    const canTrade = !!authority;

    const change24h = useCallback(
        (m: PerpMarketRow) => {
            const ref = dayRefs[m.pythTicker];
            return ref ? ((m.price - ref) / ref) * 100 : null;
        },
        [dayRefs],
    );

    /** Sign + submit an unsigned tx via whichever wallet the user has. */
    const submit = useCallback(async (tx: Transaction): Promise<string> => {
        if (isSwig) {
            const serialized = Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64");
            const { signature } = await signAndSubmit({ transaction: serialized });
            return signature;
        }
        if (!wallet.sendTransaction) throw new Error("Connect a wallet first");
        const sig = await wallet.sendTransaction(tx, connection);
        await connection.confirmTransaction(sig, "confirmed");
        return sig;
    }, [isSwig, signAndSubmit, wallet, connection]);

    const refreshAccount = useCallback(async () => {
        if (!authority) return;
        try {
            const [{ getPositions, getUsdcBalance }, { PublicKey }] = await Promise.all([
                import("@/lib/perps/flash"),
                import("@solana/web3.js"),
            ]);
            const owner = new PublicKey(authority);
            const [pos, bal] = await Promise.all([
                getPositions(connection, owner),
                getUsdcBalance(connection, owner),
            ]);
            setPositions(pos);
            setBalance(bal);
        } catch (err) {
            console.error("perps account refresh failed", err);
        }
    }, [authority, connection]);

    // Market list: load on mount, refresh on an interval, tear down on unmount.
    useEffect(() => {
        let alive = true;
        let timer: ReturnType<typeof setInterval> | null = null;
        (async () => {
            try {
                const { getMarkets } = await import("@/lib/perps/flash");
                const rows = await getMarkets(connection);
                if (!alive) return;
                setMarkets(rows);
                setLoading(false);
                timer = setInterval(async () => {
                    const fresh = await getMarkets(connection).catch(() => null);
                    if (alive && fresh) setMarkets(fresh);
                }, 10_000);
            } catch (err) {
                console.error("perps markets failed", err);
                if (alive) setLoading(false);
            }
        })();
        return () => {
            alive = false;
            if (timer) clearInterval(timer);
            import("@/lib/perps/flash").then((m) => m.teardown()).catch(() => {});
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Positions + balance: on wallet, then every 15s.
    useEffect(() => {
        refreshAccount();
        const timer = setInterval(refreshAccount, 15_000);
        return () => clearInterval(timer);
    }, [refreshAccount]);

    const closePosition = useCallback(async (p: PerpPositionRow) => {
        const [{ prepareClose }, { PublicKey }] = await Promise.all([
            import("@/lib/perps/flash"),
            import("@solana/web3.js"),
        ]);
        const tx = await prepareClose(connection, new PublicKey(authority!), p.positionKey);
        await submit(tx);
        refreshAccount();
    }, [connection, authority, submit, refreshAccount]);

    return (
        <ScrollArea className="h-full bg-background">
            <div className="mx-auto max-w-[1440px] px-4 pb-16 pt-6 md:pt-(--header-height)">
                {/* Page header */}
                <div className="pt-4">
                    <h1 className="font-pixel text-4xl tracking-tighter text-white">Perpetuals</h1>
                    <p className="mt-1.5 text-[14px] font-medium text-zinc-500">
                        Long or short with leverage, settled in USDC on Flash. Your wallet, your positions.
                    </p>
                </div>

                {!canTrade && session?.user && (
                    <div className="mt-5 rounded-2xl bg-white/[0.03] px-5 py-4 ring-1 ring-white/10">
                        <p className="text-[14px] font-bold text-white">Connect a wallet to trade</p>
                        <p className="mt-0.5 text-[13px] font-medium text-zinc-500">
                            Your watchparty wallet or any extension wallet works.
                        </p>
                    </div>
                )}

                <div className="mt-6 lg:grid lg:grid-cols-[250px_minmax(0,1fr)_340px] lg:items-start lg:gap-4">
                    {/* Markets rail — desktop */}
                    <aside className="hidden overflow-hidden rounded-3xl bg-white/[0.03] ring-1 ring-white/10 lg:block">
                        <p className="px-4 pb-1 pt-4 text-[11px] font-bold uppercase tracking-wide text-zinc-600">
                            Markets
                        </p>
                        {loading
                            ? Array.from({ length: 9 }).map((_, i) => (
                                <div key={i} className="h-12 overflow-hidden"><div className="size-full shimmer-skeleton" /></div>
                            ))
                            : markets.map((m) => (
                                <MarketRow
                                    key={m.symbol}
                                    market={m}
                                    change={change24h(m)}
                                    active={m.symbol === selected}
                                    onSelect={() => setSelected(m.symbol)}
                                />
                            ))}
                    </aside>

                    {/* Center: market header + chart (+ positions on desktop) */}
                    <div className="min-w-0">
                        {/* Markets strip — mobile */}
                        <div className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:hidden [scrollbar-width:none]">
                            {markets.map((m) => {
                                const ch = change24h(m);
                                return (
                                    <button
                                        key={m.symbol}
                                        onClick={() => setSelected(m.symbol)}
                                        className={cn(
                                            "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-bold transition-colors",
                                            m.symbol === selected
                                                ? "bg-white text-black"
                                                : "bg-white/[0.06] text-zinc-300",
                                        )}
                                    >
                                        {m.symbol}
                                        {ch !== null && (
                                            <span className={cn(
                                                "text-[11px] font-extrabold",
                                                m.symbol === selected
                                                    ? "text-black/60"
                                                    : ch >= 0 ? "text-lantern" : "text-pastelred",
                                            )}>
                                                {ch >= 0 ? "+" : ""}{ch.toFixed(1)}%
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="overflow-hidden rounded-3xl bg-white/[0.03] ring-1 ring-white/10">
                            {market ? (
                                <>
                                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pt-5">
                                        <h2 className="text-[20px] font-extrabold tracking-tight text-white">
                                            {market.symbol}
                                            <span className="text-zinc-600">-PERP</span>
                                        </h2>
                                        <span className="text-[20px] font-bold tabular-nums text-zinc-200">
                                            ${fmtPrice(market.price)}
                                        </span>
                                        {(() => {
                                            const ch = change24h(market);
                                            return ch !== null && (
                                                <span className={cn(
                                                    "text-[14px] font-extrabold tabular-nums",
                                                    ch >= 0 ? "text-lantern" : "text-pastelred",
                                                )}>
                                                    {ch >= 0 ? "+" : ""}{ch.toFixed(2)}% 24h
                                                </span>
                                            );
                                        })()}
                                        <span className="ml-auto text-[12px] font-semibold tabular-nums text-zinc-600">
                                            borrow {market.borrowHourlyPctLong.toFixed(4)}%/h · up to {market.maxLeverage}×
                                        </span>
                                    </div>
                                    <PerpsChart pythTicker={market.pythTicker} className="px-2 pb-3 pt-2" />
                                </>
                            ) : (
                                <div className="h-[380px] overflow-hidden"><div className="size-full shimmer-skeleton" /></div>
                            )}
                        </div>

                        {/* Positions — desktop position (under the chart) */}
                        <div className="max-lg:hidden">
                            <PositionsSection positions={positions} onClose={closePosition} />
                        </div>
                    </div>

                    {/* Order panel */}
                    <aside className="mt-4 lg:mt-0">
                        {market && (
                            <OrderPanel
                                key={market.symbol}
                                market={market}
                                balance={balance}
                                canTrade={canTrade}
                                connection={connection}
                                authority={authority}
                                onSubmit={async (tx) => {
                                    const sig = await submit(tx);
                                    // First trade records the wallet for the referral sweep.
                                    if (authority) recordPerpsAccount.mutate({ authority });
                                    refreshAccount();
                                    return sig;
                                }}
                            />
                        )}
                        <div className="mt-4 flex items-center justify-between rounded-3xl bg-white/[0.03] px-5 py-4 ring-1 ring-white/10">
                            <div className="flex items-center gap-2.5">
                                <span className="grid size-9 place-items-center rounded-full bg-white/[0.06] text-zinc-300">
                                    <HugeiconsIcon icon={Wallet01Icon} className="size-4" strokeWidth={2} />
                                </span>
                                <div>
                                    <p className="text-[12px] font-semibold text-zinc-500">Available to trade</p>
                                    <p className="text-[15px] font-bold tabular-nums text-white">
                                        ${fmtUsd(balance)} <span className="text-[12px] font-semibold text-zinc-500">USDC</span>
                                    </p>
                                </div>
                            </div>
                        </div>
                    </aside>
                </div>

                {/* Positions — mobile position (after the order panel) */}
                <div className="lg:hidden">
                    <PositionsSection positions={positions} onClose={closePosition} />
                </div>

                <p className="mt-6 px-1 text-[12px] font-medium leading-relaxed text-zinc-600">
                    Trading happens on the Flash Trade protocol from your own wallet — watchparty never holds
                    your collateral or positions. Leverage can liquidate your full margin; size accordingly.
                </p>
            </div>
        </ScrollArea>
    );
}

function MarketRow({
    market: m,
    change,
    active,
    onSelect,
}: {
    market: PerpMarketRow;
    change: number | null;
    active: boolean;
    onSelect: () => void;
}) {
    return (
        <button
            onClick={onSelect}
            className={cn(
                "flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left transition-colors",
                active ? "bg-white/[0.06]" : "hover:bg-white/[0.03]",
            )}
        >
            <span className="flex items-center gap-2">
                <span className="text-[14px] font-bold text-white">{m.symbol}</span>
                <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-extrabold text-zinc-500">
                    {m.maxLeverage}×
                </span>
            </span>
            <span className="text-right">
                <span className="block text-[13px] font-bold tabular-nums text-zinc-200">${fmtPrice(m.price)}</span>
                {change !== null && (
                    <span className={cn(
                        "block text-[11px] font-extrabold tabular-nums",
                        change >= 0 ? "text-lantern" : "text-pastelred",
                    )}>
                        {change >= 0 ? "+" : ""}{change.toFixed(2)}%
                    </span>
                )}
            </span>
        </button>
    );
}

function OrderPanel({
    market,
    balance,
    canTrade,
    connection,
    authority,
    onSubmit,
}: {
    market: PerpMarketRow;
    balance: number;
    canTrade: boolean;
    connection: ReturnType<typeof useConnection>["connection"];
    authority: string | null;
    onSubmit: (tx: Transaction) => Promise<string>;
}) {
    const [direction, setDirection] = useState<"long" | "short">("long");
    const [usd, setUsd] = useState("");
    const [leverage, setLeverage] = useState(5);
    const [quote, setQuote] = useState<OpenQuote | null>(null);
    const [quoting, setQuoting] = useState(false);
    const [placing, setPlacing] = useState(false);
    const quoteSeq = useRef(0);

    const long = direction === "long";
    const amount = Number(usd) || 0;
    const maxLev = market.maxLeverage;
    const insufficient = canTrade && amount > balance;

    // Live quote, debounced against typing/slider drags.
    useEffect(() => {
        if (!authority || amount < 1 || leverage < 1) {
            setQuote(null);
            return;
        }
        const seq = ++quoteSeq.current;
        setQuoting(true);
        const t = setTimeout(async () => {
            try {
                const [{ getOpenQuote }, { PublicKey }] = await Promise.all([
                    import("@/lib/perps/flash"),
                    import("@solana/web3.js"),
                ]);
                const q = await getOpenQuote(
                    connection, new PublicKey(authority), market.symbol, direction, amount, leverage,
                );
                if (quoteSeq.current === seq) setQuote(q);
            } catch (err) {
                console.error("perps quote failed", err);
                if (quoteSeq.current === seq) setQuote(null);
            } finally {
                if (quoteSeq.current === seq) setQuoting(false);
            }
        }, 350);
        return () => clearTimeout(t);
    }, [authority, connection, market.symbol, direction, amount, leverage]);

    const place = async () => {
        if (amount < 1 || !authority) return;
        setPlacing(true);
        try {
            const [{ prepareOpen }, { PublicKey }] = await Promise.all([
                import("@/lib/perps/flash"),
                import("@solana/web3.js"),
            ]);
            const tx = await prepareOpen(
                connection, new PublicKey(authority), market.symbol, direction, amount, leverage,
            );
            await onSubmit(tx);
            toast.success(`${long ? "Long" : "Short"} ${market.symbol} opened`);
            setUsd("");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Order failed");
        } finally {
            setPlacing(false);
        }
    };

    return (
        <div className="rounded-3xl bg-white/[0.03] p-4 ring-1 ring-white/10">
            {/* Direction */}
            <div className="grid grid-cols-2 gap-1 rounded-full bg-white/[0.04] p-1">
                <button
                    onClick={() => setDirection("long")}
                    className={cn(
                        "flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-full text-[14px] font-extrabold transition-colors",
                        long ? "bg-lantern text-black" : "text-zinc-400 hover:text-white",
                    )}
                >
                    <HugeiconsIcon icon={TradeUpIcon} className="size-4" strokeWidth={2.5} />
                    Long
                </button>
                <button
                    onClick={() => setDirection("short")}
                    className={cn(
                        "flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-full text-[14px] font-extrabold transition-colors",
                        !long ? "bg-pastelred text-white" : "text-zinc-400 hover:text-white",
                    )}
                >
                    <HugeiconsIcon icon={TradeDownIcon} className="size-4" strokeWidth={2.5} />
                    Short
                </button>
            </div>

            {/* Amount */}
            <p className="mt-4 px-1 text-[12px] font-bold text-zinc-500">Pay with USDC</p>
            <div className="relative mt-1.5">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[14px] font-bold text-zinc-500">$</span>
                <Input
                    radius={16}
                    value={usd}
                    onChange={(e) => setUsd(e.target.value.replace(/[^0-9.]/g, ""))}
                    placeholder="100"
                    inputMode="decimal"
                    className="h-12 bg-white/[0.04] pl-8 pr-16 text-[15px] font-bold"
                />
                {balance > 0 && (
                    <button
                        onClick={() => setUsd(String(Math.floor(balance * 100) / 100))}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-extrabold text-zinc-400 transition-colors hover:text-white"
                    >
                        MAX
                    </button>
                )}
            </div>
            <div className="mt-2 flex gap-1.5">
                {[25, 50, 100, 250].map((v) => (
                    <button
                        key={v}
                        onClick={() => setUsd(String(v))}
                        className="flex-1 cursor-pointer rounded-full bg-white/[0.06] py-1.5 text-[12px] font-bold text-zinc-400 transition-colors hover:text-white"
                    >
                        ${v}
                    </button>
                ))}
            </div>

            {/* Leverage */}
            <div className="mt-4">
                <AnimatedSlider
                    label="Leverage"
                    value={leverage}
                    onChange={(v) => setLeverage(Math.max(1, Math.min(maxLev, v)))}
                    min={1}
                    max={maxLev}
                    step={1}
                />
            </div>

            {/* Quote */}
            <div className={cn("mt-4 space-y-2 px-1 transition-opacity", quoting && "opacity-50")}>
                <QuoteRow label="Position size">
                    {quote ? `$${fmtUsd(quote.sizeUsd)} · ${quote.sizeUi.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${market.symbol}` : "—"}
                </QuoteRow>
                <QuoteRow label="Entry price">{quote ? `$${fmtPrice(quote.entryPrice)}` : "—"}</QuoteRow>
                <QuoteRow label="Liquidation est.">
                    {quote ? <span className="text-sunset">${fmtPrice(quote.liquidationPrice)}</span> : "—"}
                </QuoteRow>
                <QuoteRow label="Fees">{quote ? `$${quote.feesUsd.toFixed(2)}` : "—"}</QuoteRow>
            </div>

            {insufficient && (
                <p className="mt-3 rounded-2xl bg-sunset/10 px-4 py-2.5 text-[12px] font-semibold text-sunset">
                    That&apos;s more USDC than your wallet holds (${fmtUsd(balance)}).
                </p>
            )}

            <button
                onClick={place}
                disabled={placing || !canTrade || amount < 1 || insufficient || !quote}
                className={cn(
                    "mt-4 h-12 w-full cursor-pointer rounded-full text-[14px] font-extrabold transition-colors disabled:opacity-40",
                    long ? "bg-lantern text-black hover:bg-lantern/90" : "bg-pastelred text-white hover:bg-pastelred/90",
                )}
            >
                {placing
                    ? "Placing…"
                    : `${long ? "Long" : "Short"} ${market.symbol} · ${leverage}×`}
            </button>
        </div>
    );
}

function QuoteRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-zinc-500">{label}</span>
            <span className="text-[13px] font-bold tabular-nums text-zinc-200">{children}</span>
        </div>
    );
}

function PositionsSection({
    positions,
    onClose,
}: {
    positions: PerpPositionRow[];
    onClose: (p: PerpPositionRow) => Promise<void>;
}) {
    if (positions.length === 0) return null;
    return (
        <div className="mt-4">
            <p className="px-1 text-[13px] font-bold text-zinc-400">Your positions</p>
            <div className="mt-2 space-y-1.5">
                {positions.map((p) => (
                    <PositionRow key={p.positionKey} position={p} onClose={() => onClose(p)} />
                ))}
            </div>
        </div>
    );
}

function PositionRow({ position: p, onClose }: { position: PerpPositionRow; onClose: () => Promise<void> }) {
    const [closing, setClosing] = useState(false);

    const close = async () => {
        setClosing(true);
        try {
            await onClose();
            toast.success(`${p.symbol} position closed`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Close failed");
        } finally {
            setClosing(false);
        }
    };

    const up = p.pnlUsd >= 0;
    return (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/[0.03] px-4 py-3 ring-1 ring-white/10">
            <div className="flex items-center gap-3">
                <span
                    className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-full",
                        p.direction === "long" ? "bg-lantern/15 text-lantern" : "bg-pastelred/15 text-pastelred",
                    )}
                >
                    <HugeiconsIcon icon={p.direction === "long" ? TradeUpIcon : TradeDownIcon} className="size-4" strokeWidth={2} />
                </span>
                <div>
                    <p className="text-[14px] font-bold text-white">
                        {p.direction === "long" ? "Long" : "Short"} {p.symbol}
                        <span className="ml-1.5 rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-extrabold text-zinc-500">
                            {p.leverage.toFixed(1)}×
                        </span>
                    </p>
                    <p className="text-[12px] font-medium tabular-nums text-zinc-500">
                        ${fmtUsd(p.sizeUsd)} @ ${fmtPrice(p.entryPrice)} → ${fmtPrice(p.markPrice)}
                        <span className="text-sunset"> · liq ${fmtPrice(p.liquidationPrice)}</span>
                    </p>
                </div>
            </div>
            <div className="flex items-center gap-3">
                <span className={cn("text-[14px] font-bold tabular-nums", up ? "text-lantern" : "text-pastelred")}>
                    {up ? "+" : ""}${fmtUsd(p.pnlUsd)}
                </span>
                <button
                    onClick={close}
                    disabled={closing}
                    className="h-9 cursor-pointer rounded-full bg-white/[0.06] px-4 text-[13px] font-bold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
                >
                    {closing ? "Closing…" : "Close"}
                </button>
            </div>
        </div>
    );
}
