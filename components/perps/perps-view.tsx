"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import { TradeUpIcon, TradeDownIcon, Wallet01Icon } from "@hugeicons/core-free-icons";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useWalletSigning } from "@/hooks/use-wallet-signing";
import { useSwigSession } from "@/hooks/use-swig-session";
import { AnimatedSlider } from "@/components/ui/motion-slider";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PerpsChart } from "@/components/perps/perps-chart";
import { PerpsTape } from "@/components/perps/perps-tape";
import { cn } from "@/lib/utils";
import type { Keypair, Transaction } from "@solana/web3.js";
import type { PerpMarketRow, PerpPositionRow, PerpSymbol, OpenQuote, PerpsAccountState } from "@/lib/perps/flash";

// Perpetuals on Flash Trade v2 (MagicBlock Ephemeral Rollups) — non-custodial.
//
// Money model: wallet USDC → Flash deposit ledger (base-layer tx, wallet-
// signed through the app's dual path) → trades execute on Flash's ER,
// signed by a LOCAL SESSION KEY the wallet authorized once. So opening and
// closing positions never prompts the wallet — Swig and extension wallets
// get the identical instant-trade UX. The SDK (heavy) loads only inside
// this route via await import().

/** Session-local fill log — nothing indexes Flash fills yet, so the Trades /
 *  Order History tabs show what happened in this session. */
type TradeFill = {
    id: string;
    time: number;
    symbol: PerpSymbol;
    direction: "long" | "short";
    kind: "open" | "close";
    sizeUsd: number;
    price: number;
    leverage: number;
    pnlUsd?: number;
};

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

export function PerpsView({ geoBlocked = false }: { geoBlocked?: boolean }) {
    const { connection } = useConnection();
    const wallet = useWallet();
    const { data: session } = useAuthSession();
    const { signAndSubmit } = useWalletSigning();
    const swigSession = useSwigSession();
    const { authority: walletAuthority, isSwig } = useTradeAuthority();
    const router = useRouter();
    // Geo-block = read-only mode (Phantom's pattern): everything renders,
    // no authority means every trading affordance is disabled.
    const authority = geoBlocked ? null : walletAuthority;

    const [markets, setMarkets] = useState<PerpMarketRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<PerpSymbol>("SOL");
    const [positions, setPositions] = useState<PerpPositionRow[]>([]);
    const [account, setAccount] = useState<PerpsAccountState | null>(null);
    const [managing, setManaging] = useState(false);
    const [fills, setFills] = useState<TradeFill[]>([]);
    const logFill = useCallback((f: Omit<TradeFill, "id">) => {
        setFills((prev) => [{ ...f, id: crypto.randomUUID() }, ...prev].slice(0, 100));
    }, []);
    const relaySwig = trpc.wallet.relaySwigTransaction.useMutation();
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

    /** Base-layer tx via whichever wallet the user has (no extra signers). */
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

    /**
     * Base-layer tx that a local keypair must co-sign (the Flash session
     * grant / withdraw escrow). Extension wallets pass it as a signer; Swig
     * wallets take the Tier-1 relay path with the extra signature added to
     * the wrapped tx before relaying.
     */
    const submitCosigned = useCallback(async (tx: Transaction, cosigner: Keypair): Promise<string> => {
        if (isSwig) {
            const s = swigSession.session ?? (await swigSession.ensureSession());
            if (!s) throw new Error("Wallet session unavailable — try again");
            const [{ buildSwigTransaction }, { PublicKey, Transaction: Tx }] = await Promise.all([
                import("@/lib/swig/swig-signing"),
                import("@solana/web3.js"),
            ]);
            const inner = Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64");
            const wrapped = await buildSwigTransaction(s, inner, new PublicKey(s.treasuryPubkey), connection);
            const outer = Tx.from(Buffer.from(wrapped, "base64"));
            outer.partialSign(cosigner);
            const { signature } = await relaySwig.mutateAsync({
                transaction: outer.serialize({ requireAllSignatures: false }).toString("base64"),
            });
            return signature;
        }
        if (!wallet.sendTransaction) throw new Error("Connect a wallet first");
        const sig = await wallet.sendTransaction(tx, connection, { signers: [cosigner] });
        await connection.confirmTransaction(sig, "confirmed");
        return sig;
    }, [isSwig, swigSession, relaySwig, wallet, connection]);

    const refreshAccount = useCallback(async () => {
        if (!authority) return;
        try {
            const [{ getPositions, getAccountState }, { PublicKey }] = await Promise.all([
                import("@/lib/perps/flash"),
                import("@solana/web3.js"),
            ]);
            const owner = new PublicKey(authority);
            const [pos, state] = await Promise.all([
                getPositions(connection, owner),
                getAccountState(connection, owner),
            ]);
            setPositions(pos);
            setAccount(state);
        } catch (err) {
            console.error("perps account refresh failed", err);
        }
    }, [authority, connection]);

    /** One-time Flash onboarding: base accounts, then the session grant. */
    const ensureReady = useCallback(async (): Promise<void> => {
        if (!authority) throw new Error("Connect a wallet first");
        if (account?.ready) return;
        const [{ prepareSetup, prepareSession }, { PublicKey }] = await Promise.all([
            import("@/lib/perps/flash"),
            import("@solana/web3.js"),
        ]);
        const owner = new PublicKey(authority);
        const setupTx = await prepareSetup(connection, owner);
        if (setupTx) await submit(setupTx);
        const sessionReq = await prepareSession(connection, owner);
        if (sessionReq) await submitCosigned(sessionReq.tx, sessionReq.sessionKeypair);
        await refreshAccount();
    }, [authority, account?.ready, connection, submit, submitCosigned, refreshAccount]);

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

    // Positions + balances: on wallet, then every 15s.
    useEffect(() => {
        refreshAccount();
        const timer = setInterval(refreshAccount, 15_000);
        return () => clearInterval(timer);
    }, [refreshAccount]);

    const closeRow = useCallback(async (p: PerpPositionRow) => {
        const [{ closePosition }, { PublicKey }] = await Promise.all([
            import("@/lib/perps/flash"),
            import("@solana/web3.js"),
        ]);
        await closePosition(connection, new PublicKey(authority!), p);
        logFill({
            time: Date.now(),
            symbol: p.symbol,
            direction: p.direction,
            kind: "close",
            sizeUsd: p.sizeUsd,
            price: p.markPrice,
            leverage: p.leverage,
            pnlUsd: p.pnlUsd,
        });
        refreshAccount();
    }, [connection, authority, refreshAccount, logFill]);

    return (
        <ScrollArea className="h-full bg-background">
            <div className="mx-auto max-w-[1440px] px-4 pb-16 pt-6 md:pt-(--header-height)">
                {geoBlocked && (
                    <div className="mt-4 flex items-center justify-center gap-2 rounded-md bg-sunset/10 px-5 py-3">
                        <p className="text-center text-[13px] font-semibold text-sunset">
                            Access to this product isn&apos;t available in your region. Prices and markets stay visible.
                        </p>
                    </div>
                )}
                {!canTrade && !geoBlocked && session?.user && (
                    <div className="mt-5 rounded-md bg-white/[0.05] px-5 py-4 ring-1 ring-white/10">
                        <p className="text-[14px] font-bold text-white">Connect a wallet to trade</p>
                        <p className="mt-0.5 text-[13px] font-medium text-zinc-500">
                            Your watchparty wallet or any extension wallet works.
                        </p>
                    </div>
                )}

                <div className="mt-4 lg:grid lg:grid-cols-[250px_minmax(0,1fr)_340px] lg:items-start lg:gap-2">
                    {/* Markets rail — desktop. Tokens|Perps|Follows tabs per the
                        Phantom reference; Tokens routes to spot, Follows is a
                        placeholder until a follows feed exists. */}
                    <aside className="hidden overflow-hidden rounded-lg bg-white/[0.05] ring-1 ring-white/10 lg:block">
                        <div className="flex border-b border-white/[0.06]">
                            <button
                                onClick={() => router.push("/trade")}
                                className="flex-1 cursor-pointer border-r border-white/[0.06] py-3 text-[13px] font-bold text-zinc-500 transition-colors hover:text-white"
                            >
                                Tokens
                            </button>
                            <button className="flex-1 cursor-default border-r border-white/[0.06] py-3 text-[13px] font-bold text-white">
                                Perps
                            </button>
                            <button className="flex-1 cursor-default py-3 text-[13px] font-bold text-zinc-700">
                                Follows
                            </button>
                        </div>
                        <div className="p-1.5">
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
                        </div>
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

                        <div className="lg:grid lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_240px] lg:gap-2">
                            <div className="overflow-hidden rounded-lg bg-white/[0.05] ring-1 ring-white/10">
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

                            {/* Book slot — Flash has no orderbook, fills settle at oracle.
                                Absolutely filled so the tape never sets the row height:
                                the chart alone decides how tall this band is. */}
                            <div className="relative hidden lg:block">
                                {market && (
                                    <div className="absolute inset-0">
                                        <PerpsTape pythTicker={market.pythTicker} livePrice={market.price} />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Positions / Trades / Funding / Order History — desktop */}
                        <div className="mt-2 max-lg:hidden">
                            <TerminalTabs positions={positions} fills={fills} markets={markets} onClose={closeRow} />
                        </div>
                    </div>

                    {/* Order panel */}
                    <aside className="mt-3 lg:mt-0">
                        {market && (
                            <OrderPanel
                                key={market.symbol}
                                market={market}
                                account={account}
                                canTrade={canTrade}
                                connection={connection}
                                authority={authority}
                                ensureReady={ensureReady}
                                onFill={logFill}
                                onOpened={() => {
                                    if (authority) recordPerpsAccount.mutate({ authority });
                                    refreshAccount();
                                }}
                            />
                        )}
                        <button
                            onClick={() => canTrade && setManaging(true)}
                            disabled={!canTrade}
                            className="mt-2 flex w-full cursor-pointer items-center justify-between rounded-lg bg-white/[0.05] px-5 py-4 text-left ring-1 ring-white/10 transition-colors hover:bg-white/[0.07] disabled:cursor-default"
                        >
                            <div className="flex items-center gap-2.5">
                                <span className="grid size-9 place-items-center rounded-full bg-white/[0.06] text-zinc-300">
                                    <HugeiconsIcon icon={Wallet01Icon} className="size-4" strokeWidth={2} />
                                </span>
                                <div>
                                    <p className="text-[12px] font-semibold text-zinc-500">Trading balance</p>
                                    <p className="text-[15px] font-bold tabular-nums text-white">
                                        ${fmtUsd(account?.ledgerUsdc ?? 0)}
                                        <span className="ml-2 text-[12px] font-semibold text-zinc-500">
                                            ${fmtUsd(account?.walletUsdc ?? 0)} in wallet
                                        </span>
                                    </p>
                                </div>
                            </div>
                            <span className="rounded-full bg-white/[0.06] px-3 py-1.5 text-[12px] font-bold text-zinc-300">
                                Manage
                            </span>
                        </button>
                    </aside>
                </div>

                {/* Positions / Trades / Funding / Order History — mobile */}
                <div className="mt-3 lg:hidden">
                    <TerminalTabs positions={positions} fills={fills} markets={markets} onClose={closeRow} />
                </div>

                <p className="mt-6 px-1 text-[12px] font-medium leading-relaxed text-zinc-600">
                    Trading happens on the Flash Trade protocol from your own wallet — watchparty never holds
                    your collateral or positions. Leverage can liquidate your full margin; size accordingly.
                </p>
            </div>

            {managing && authority && (
                <CollateralDialog
                    account={account}
                    onDone={() => { setManaging(false); refreshAccount(); }}
                    onClose={() => setManaging(false)}
                    transfer={async (mode, usdAmount) => {
                        const [{ prepareDeposit, prepareWithdraw }, { PublicKey }] = await Promise.all([
                            import("@/lib/perps/flash"),
                            import("@solana/web3.js"),
                        ]);
                        const owner = new PublicKey(authority);
                        if (mode === "deposit") {
                            await ensureReady();
                            return submit(await prepareDeposit(connection, owner, usdAmount));
                        }
                        const { tx, sessionKeypair } = await prepareWithdraw(connection, owner, usdAmount);
                        return submitCosigned(tx, sessionKeypair);
                    }}
                />
            )}
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
                "flex w-full cursor-pointer items-center justify-between rounded-md px-2.5 py-2.5 text-left transition-colors",
                active ? "bg-white/[0.06]" : "hover:bg-white/[0.04]",
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
    account,
    canTrade,
    connection,
    authority,
    ensureReady,
    onFill,
    onOpened,
}: {
    market: PerpMarketRow;
    account: PerpsAccountState | null;
    canTrade: boolean;
    connection: ReturnType<typeof useConnection>["connection"];
    authority: string | null;
    ensureReady: () => Promise<void>;
    onFill: (f: Omit<TradeFill, "id">) => void;
    onOpened: () => void;
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
    const balance = account?.ledgerUsdc ?? 0;
    const insufficient = canTrade && !!account?.ready && amount > balance;

    // Live quote from the ER view, debounced against typing/slider drags.
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
            // First-time traders run the one-time setup (wallet-signed), then
            // every trade after this is session-signed — no wallet prompt.
            await ensureReady();
            const [{ openPosition }, { PublicKey }] = await Promise.all([
                import("@/lib/perps/flash"),
                import("@solana/web3.js"),
            ]);
            await openPosition(
                connection, new PublicKey(authority), market.symbol, direction, amount, leverage,
            );
            toast.success(`${long ? "Long" : "Short"} ${market.symbol} opened`);
            if (quote) {
                onFill({
                    time: Date.now(),
                    symbol: market.symbol,
                    direction,
                    kind: "open",
                    sizeUsd: quote.sizeUsd,
                    price: quote.entryPrice,
                    leverage,
                });
            }
            setUsd("");
            onOpened();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Order failed");
        } finally {
            setPlacing(false);
        }
    };

    return (
        <div className="rounded-lg bg-white/[0.05] p-4 ring-1 ring-white/10">
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
            <p className="mt-4 px-1 text-[12px] font-bold text-zinc-500">Collateral (USDC)</p>
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
                <p className="mt-3 rounded-md bg-sunset/10 px-4 py-2.5 text-[12px] font-semibold text-sunset">
                    That&apos;s more than your ${fmtUsd(balance)} trading balance — deposit USDC first.
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
                    ? account?.ready ? "Placing…" : "Setting up…"
                    : account && !account.ready
                        ? `Enable trading & ${long ? "long" : "short"} ${market.symbol}`
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

// ─── Terminal tabs: positions / trades / funding / order history ───

const TERM_TABS = ["positions", "trades", "funding", "orders"] as const;
type TermTab = (typeof TERM_TABS)[number];

const fmtTime = (t: number) =>
    new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function TerminalTabs({
    positions,
    fills,
    markets,
    onClose,
}: {
    positions: PerpPositionRow[];
    fills: TradeFill[];
    markets: PerpMarketRow[];
    onClose: (p: PerpPositionRow) => Promise<void>;
}) {
    const [tab, setTab] = useState<TermTab>("positions");
    // Unique per instance — desktop and mobile mounts coexist (CSS-hidden),
    // and a shared layoutId would animate the pill between them.
    const uid = useId();
    const labels: Record<TermTab, string> = {
        positions: `Positions (${positions.length})`,
        trades: "Trades",
        funding: "Funding",
        orders: "Order History",
    };
    return (
        <div className="rounded-lg bg-white/[0.05] ring-1 ring-white/10">
            <div className="flex items-center gap-1 overflow-x-auto px-2 pt-2 [scrollbar-width:none]">
                {TERM_TABS.map((t) => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={cn(
                            "relative z-10 shrink-0 cursor-pointer rounded-full px-3 py-1.5 text-[12px] font-bold transition-all",
                            tab === t ? "text-white/80" : "text-zinc-500 hover:bg-zinc-900/65 hover:text-white",
                        )}
                    >
                        {labels[t]}
                        {tab === t && (
                            <motion.div
                                layoutId={`perpsTermTab-${uid}`}
                                className="absolute inset-0 -z-10 rounded-full bg-gray1"
                                initial={false}
                                transition={{ type: "spring", stiffness: 250, damping: 30 }}
                            />
                        )}
                    </button>
                ))}
            </div>
            <div className="p-2">
                {tab === "positions" &&
                    (positions.length ? (
                        <div className="space-y-1">
                            {positions.map((p) => (
                                <PositionRow key={p.marketKey} position={p} onClose={() => onClose(p)} />
                            ))}
                        </div>
                    ) : (
                        <TermEmpty title="No open positions" sub="Open a long or short and it lands here." />
                    ))}
                {tab === "trades" &&
                    (fills.length ? (
                        <div>{fills.map((f) => <FillRow key={f.id} fill={f} />)}</div>
                    ) : (
                        <TermEmpty title="No fills yet" sub="Opens and closes from this session show up here." />
                    ))}
                {tab === "funding" && <FundingTable markets={markets} />}
                {tab === "orders" &&
                    (fills.length ? (
                        <div>{fills.map((f) => <OrderRow key={f.id} fill={f} />)}</div>
                    ) : (
                        <TermEmpty title="No orders yet" sub="Flash fills market orders instantly — yours appear here." />
                    ))}
            </div>
        </div>
    );
}

function TermEmpty({ title, sub }: { title: string; sub: string }) {
    return (
        <div className="flex min-h-[96px] flex-col items-center justify-center py-4 text-center">
            <p className="text-[13px] font-bold text-zinc-400">{title}</p>
            <p className="mt-0.5 text-[12px] font-medium text-zinc-600">{sub}</p>
        </div>
    );
}

function FillRow({ fill: f }: { fill: TradeFill }) {
    const long = f.direction === "long";
    return (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md px-3 py-2 transition-colors hover:bg-white/[0.03]">
            <div className="flex items-center gap-2.5">
                <span className={cn("text-[12px] font-extrabold", long ? "text-lantern" : "text-pastelred")}>
                    {long ? "Long" : "Short"}
                </span>
                <span className="text-[13px] font-bold text-white">{f.symbol}</span>
                <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-extrabold text-zinc-500">
                    {f.kind === "open" ? "Open" : "Close"}
                </span>
            </div>
            <div className="flex items-center gap-4 tabular-nums">
                {f.kind === "close" && f.pnlUsd !== undefined && (
                    <span className={cn("text-[12px] font-bold", f.pnlUsd >= 0 ? "text-lantern" : "text-pastelred")}>
                        {f.pnlUsd >= 0 ? "+" : "−"}${fmtUsd(Math.abs(f.pnlUsd))}
                    </span>
                )}
                <span className="text-[12px] font-semibold text-zinc-400">
                    ${fmtUsd(f.sizeUsd)} @ ${fmtPrice(f.price)}
                </span>
                <span className="text-[11px] font-semibold text-zinc-600">{fmtTime(f.time)}</span>
            </div>
        </div>
    );
}

function OrderRow({ fill: f }: { fill: TradeFill }) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md px-3 py-2 transition-colors hover:bg-white/[0.03]">
            <div className="flex items-center gap-2.5">
                <span className="text-[13px] font-bold text-white">{f.symbol}</span>
                <span className="text-[12px] font-semibold capitalize text-zinc-500">
                    Market {f.direction} · {f.leverage.toFixed(0)}×
                </span>
            </div>
            <div className="flex items-center gap-4 tabular-nums">
                <span className="text-[12px] font-bold text-lantern">Filled</span>
                <span className="text-[12px] font-semibold text-zinc-400">
                    ${fmtUsd(f.sizeUsd)} @ ${fmtPrice(f.price)}
                </span>
                <span className="text-[11px] font-semibold text-zinc-600">{fmtTime(f.time)}</span>
            </div>
        </div>
    );
}

function FundingTable({ markets }: { markets: PerpMarketRow[] }) {
    return (
        <div>
            <div className="flex items-center justify-between px-3 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wide text-zinc-600">
                <span>Market</span>
                <span className="flex gap-2">
                    <span className="w-20 text-right">Long /h</span>
                    <span className="w-20 text-right">Short /h</span>
                </span>
            </div>
            {markets.map((m) => (
                <div
                    key={m.symbol}
                    className="flex items-center justify-between rounded-md px-3 py-2 transition-colors hover:bg-white/[0.03]"
                >
                    <span className="text-[13px] font-bold text-white">{m.symbol}</span>
                    <span className="flex gap-2 tabular-nums">
                        <span className="w-20 text-right text-[12px] font-semibold text-zinc-400">
                            {m.borrowHourlyPctLong.toFixed(4)}%
                        </span>
                        <span className="w-20 text-right text-[12px] font-semibold text-zinc-400">
                            {m.borrowHourlyPctShort.toFixed(4)}%
                        </span>
                    </span>
                </div>
            ))}
            <p className="px-3 pb-1 pt-2 text-[11px] font-medium leading-relaxed text-zinc-600">
                Hourly borrow cost as % of position size — Flash&apos;s pool model charges borrow instead of bilateral funding.
            </p>
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
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-white/[0.03] px-4 py-3 ring-1 ring-white/10">
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
                    {up ? "+" : "−"}${fmtUsd(Math.abs(p.pnlUsd))}
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

function CollateralDialog({
    account,
    onDone,
    onClose,
    transfer,
}: {
    account: PerpsAccountState | null;
    onDone: () => void;
    onClose: () => void;
    transfer: (mode: "deposit" | "withdraw", usd: number) => Promise<string>;
}) {
    const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
    const [usd, setUsd] = useState("");
    const [busy, setBusy] = useState(false);
    const max = mode === "deposit" ? account?.walletUsdc ?? 0 : account?.ledgerUsdc ?? 0;

    const go = async () => {
        const amount = Number(usd);
        if (!Number.isFinite(amount) || amount <= 0) return;
        setBusy(true);
        try {
            await transfer(mode, amount);
            toast.success(mode === "deposit" ? `Deposited $${amount} USDC` : `Withdrawal of $${amount} USDC started`);
            onDone();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Transfer failed");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="gap-4 rounded-4xl border-none p-6 sm:max-w-[400px]" showCloseButton={false}>
                <DialogTitle className="text-center text-[18px] font-bold tracking-tight text-white">
                    Trading balance
                </DialogTitle>
                <p className="-mt-2 text-center text-[13px] font-medium text-zinc-500">
                    ${fmtUsd(account?.ledgerUsdc ?? 0)} deposited · ${fmtUsd(account?.walletUsdc ?? 0)} in wallet
                </p>

                <div className="inline-flex self-center rounded-full bg-white/[0.06] p-1">
                    {(["deposit", "withdraw"] as const).map((m) => (
                        <button
                            key={m}
                            onClick={() => setMode(m)}
                            className={cn(
                                "cursor-pointer rounded-full px-5 py-1.5 text-[13px] font-bold capitalize transition-colors",
                                mode === m ? "bg-white text-black" : "text-zinc-400 hover:text-white",
                            )}
                        >
                            {m}
                        </button>
                    ))}
                </div>

                <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[14px] font-bold text-zinc-500">$</span>
                    <Input
                        radius={16}
                        value={usd}
                        onChange={(e) => setUsd(e.target.value.replace(/[^0-9.]/g, ""))}
                        placeholder="100"
                        inputMode="decimal"
                        autoFocus
                        className="h-12 bg-white/[0.04] pl-8 pr-16 text-[15px] font-bold"
                    />
                    {max > 0 && (
                        <button
                            onClick={() => setUsd(String(Math.floor(max * 100) / 100))}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-extrabold text-zinc-400 transition-colors hover:text-white"
                        >
                            MAX
                        </button>
                    )}
                </div>

                {mode === "withdraw" && (
                    <p className="-mt-1 px-1 text-center text-[12px] font-medium text-zinc-600">
                        Withdrawals settle back to your wallet in about a minute.
                    </p>
                )}

                <button
                    onClick={go}
                    disabled={busy || !Number(usd)}
                    className="h-12 w-full cursor-pointer rounded-full bg-white text-[14px] font-bold text-black transition-colors hover:bg-white/90 disabled:opacity-40"
                >
                    {busy ? "Signing…" : mode === "deposit" ? `Deposit $${usd || "0"} USDC` : `Withdraw $${usd || "0"} USDC`}
                </button>
            </DialogContent>
        </Dialog>
    );
}
