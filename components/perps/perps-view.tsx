"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import { TradeUpIcon, TradeDownIcon, ArrowDown01Icon, ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { PinkStarLogo } from "@/components/icons";
import { GooDropdown } from "@/components/ui/goo-dropdown";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useWalletSigning } from "@/hooks/use-wallet-signing";
import { useSwigSession } from "@/hooks/use-swig-session";
import { AnimatedSlider } from "@/components/ui/motion-slider";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PerpsTVChart } from "@/components/perps/perps-tv-chart";
import { PerpsTape } from "@/components/perps/perps-tape";
import { PerpsSkeleton } from "@/components/perps/perps-skeleton";
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

/** Followed perp markets (Phantom's Follow button) — localStorage, feeds the rail's Follows tab. */
function usePerpFollows(): [Set<string>, (symbol: string) => void] {
    const [follows, setFollows] = useState<Set<string>>(new Set());
    useEffect(() => {
        try {
            const raw = localStorage.getItem("perps-follows");
            if (raw) setFollows(new Set(JSON.parse(raw) as string[]));
        } catch { /* fresh set */ }
    }, []);
    const toggle = useCallback((symbol: string) => {
        setFollows((prev) => {
            const next = new Set(prev);
            if (next.has(symbol)) next.delete(symbol);
            else next.add(symbol);
            localStorage.setItem("perps-follows", JSON.stringify([...next]));
            return next;
        });
    }, []);
    return [follows, toggle];
}

/** Latest Pyth benchmark print for the header's Oracle section (Mark = live ER price). */
function useOraclePrice(pythTicker: string | undefined) {
    const [price, setPrice] = useState<number | null>(null);
    useEffect(() => {
        if (!pythTicker) return;
        let alive = true;
        setPrice(null);
        const load = async () => {
            try {
                const to = Math.floor(Date.now() / 1000);
                const res = await fetch(
                    `/api/pyth-udf/history` +
                    `?symbol=${encodeURIComponent(pythTicker)}&resolution=1&from=${to - 300}&to=${to}`,
                );
                const d = (await res.json()) as { s: string; c: number[] };
                if (alive && d.s === "ok" && d.c.length) setPrice(d.c[d.c.length - 1]);
            } catch { /* keep last */ }
        };
        load();
        const timer = setInterval(load, 30_000);
        return () => {
            alive = false;
            clearInterval(timer);
        };
    }, [pythTicker]);
    return price;
}

/** 24h-ago reference prices — one shared server sweep (see trade.getPerpDayRefs). */
function useDayRefs(markets: PerpMarketRow[]) {
    const tickers = useMemo(() => [...new Set(markets.map((m) => m.pythTicker))].sort(), [markets]);
    const { data } = trpc.trade.getPerpDayRefs.useQuery(
        { tickers },
        { enabled: tickers.length > 0, staleTime: 300_000, refetchInterval: 600_000 },
    );
    return data ?? {};
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
    const [managing, setManaging] = useState<false | "deposit" | "withdraw">(false);
    const [fills, setFills] = useState<TradeFill[]>([]);
    const [railTab, setRailTab] = useState<"perps" | "follows">("perps");
    // Panel geometry — collapse toggle for the rail + drag-resizable chart
    // band (the splitter under chart/book), both persisted per browser.
    const [railCollapsed, setRailCollapsed] = useState<boolean>(() => {
        if (typeof localStorage === "undefined") return false;
        return localStorage.getItem("perps-rail-collapsed") === "1";
    });
    const [chartH, setChartH] = useState<number>(() => {
        if (typeof localStorage === "undefined") return 420;
        const saved = Number(localStorage.getItem("perps-chart-h"));
        return saved >= 240 && saved <= 720 ? saved : 420;
    });
    const toggleRail = useCallback(() => {
        setRailCollapsed((c) => {
            localStorage.setItem("perps-rail-collapsed", c ? "0" : "1");
            return !c;
        });
    }, []);
    const startBandResize = useCallback((e: React.PointerEvent) => {
        e.preventDefault();
        const startY = e.clientY;
        const startH = chartH;
        const move = (ev: PointerEvent) => {
            const next = Math.max(240, Math.min(720, startH + ev.clientY - startY));
            setChartH(next);
        };
        const up = () => {
            window.removeEventListener("pointermove", move);
            setChartH((h) => {
                localStorage.setItem("perps-chart-h", String(h));
                return h;
            });
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up, { once: true });
    }, [chartH]);
    const [perpFollows, toggleFollow] = usePerpFollows();
    const followedTokens = trpc.trade.getFollowedTokens.useQuery(undefined, {
        enabled: railTab === "follows" && !!session?.user,
    });
    const logFill = useCallback((f: Omit<TradeFill, "id">) => {
        setFills((prev) => [{ ...f, id: crypto.randomUUID() }, ...prev].slice(0, 100));
    }, []);
    const relaySwig = trpc.wallet.relaySwigTransaction.useMutation();
    // Feeds the perps referral sweep — which users trade perps through us.
    const recordPerpsAccount = trpc.trade.recordDriftAccount.useMutation();

    const dayRefs = useDayRefs(markets);
    const market = markets.find((m) => m.symbol === selected) ?? null;
    const oraclePrice = useOraclePrice(market?.pythTicker);
    const canTrade = !!authority;
    // Desktop-only chart-height override (ssr:false, so window exists).
    const [isLg] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches);

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

    // Same surface the chunk loader shows — one continuous loading state
    // from route entry until markets render.
    if (loading) return <PerpsSkeleton geoBlocked={geoBlocked} />;

    return (
        <ScrollArea className="h-full bg-background">
            <div className="mx-auto flex max-w-[1440px] flex-col px-2 pb-4 pt-2 md:pt-(--header-height) lg:h-dvh lg:pb-2">
                {geoBlocked && (
                    <div className=" flex items-center justify-center gap-2 rounded-md bg-sunset/10 px-4 py-2.5">
                        <p className="text-center text-[13px] font-semibold text-sunset">
                            Access to this product isn&apos;t available in your region. Prices and markets stay visible.
                        </p>
                    </div>
                )}
                {!canTrade && !geoBlocked && session?.user && (
                    <div className="rounded-md bg-panel1 px-4 py-3 border border-white/5">
                        <p className="text-[14px] font-bold text-white">Connect a wallet to trade</p>
                        <p className="mt-0.5 text-[13px] font-medium text-zinc-500">
                            Your watchparty wallet or any extension wallet works.
                        </p>
                    </div>
                )}

                {/* Column widths measured off docs/perpsterminal.png @1440:
                    rail 320 / chart flex / book 320 / ticket 320, 8px gutters. */}
                {/* grid-rows pins the single row to the container height —
                    without it the row auto-sizes to the tallest column, the
                    page outgrows the viewport, and the whole thing scrolls. */}
                <div
                    className={cn(
                        "mt-2 lg:grid lg:min-h-0 lg:flex-1 lg:grid-rows-[minmax(0,1fr)] lg:gap-2",
                        railCollapsed
                            ? "lg:grid-cols-[minmax(0,1fr)_320px]"
                            : "lg:grid-cols-[320px_minmax(0,1fr)_320px]",
                    )}
                >
                    {/* Markets rail — desktop. Tokens|Perps|Follows switch the
                        list in place (Phantom anatomy): Perps = Flash markets,
                        Tokens = hottest platform coins, Follows = coins from
                        creators you follow. Token rows open the token page. */}
                    <aside className={cn("hidden min-h-0 flex-col overflow-hidden rounded-lg border border-white/5 bg-panel2", !railCollapsed && "lg:flex")}>
                        {/* Inactive tabs carry the dark fill; the active tab is
                            transparent so it IS the body color at any opacity. */}
                        <div className="flex">
                            {(["perps", "follows"] as const).map((t, i) => (
                                <button
                                    key={t}
                                    onClick={() => setRailTab(t)}
                                    className={cn(
                                        "flex-1 cursor-pointer py-3 text-base font-bold capitalize transition-colors",
                                        i < 1 && "",
                                        railTab === t ? "text-white" : "bg-panel1 text-zinc-500 hover:text-white",
                                    )}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto p-1.5 [scrollbar-width:none]">
                            {railTab === "perps" &&
                                (loading
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
                                    )))}
                            {railTab === "follows" && (() => {
                                const followedMarkets = markets.filter((m) => perpFollows.has(m.symbol));
                                const coins = followedTokens.data ?? [];
                                if (!followedTokens.isLoading && followedMarkets.length === 0 && coins.length === 0) {
                                    return (
                                        <p className="px-2.5 py-6 text-center text-sm font-medium text-zinc-600">
                                            Nothing followed yet — hit Follow on a market, or follow creators to see their coins.
                                        </p>
                                    );
                                }
                                return (
                                    <>
                                        {followedMarkets.map((m) => (
                                            <MarketRow
                                                key={m.symbol}
                                                market={m}
                                                change={change24h(m)}
                                                active={m.symbol === selected}
                                                onSelect={() => setSelected(m.symbol)}
                                            />
                                        ))}
                                        {followedTokens.isLoading
                                            ? Array.from({ length: 3 }).map((_, i) => (
                                                <div key={i} className="h-12 overflow-hidden"><div className="size-full shimmer-skeleton" /></div>
                                            ))
                                            : coins.map((t) => (
                                                <TokenRailRow key={t.id} token={t} onOpen={() => router.push(`/coin/${t.tokenAddress || t.id}`)} />
                                            ))}
                                    </>
                                );
                            })()}
                        </div>
                    </aside>

                    {/* Center: THE scrollable region — chart band + positions
                        strip scroll together; rail and ticket stay put. */}
                    <div className="min-w-0 lg:min-h-0 lg:overflow-y-auto lg:[scrollbar-width:none]">
                        {/* Markets strip — mobile */}
                        <div className="-mx-2 mb-3 flex gap-1.5 overflow-x-auto px-2 pb-1 lg:hidden [scrollbar-width:none]">
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

                        <div className="lg:grid lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-2">
                            <div className="relative overflow-hidden rounded-lg border border-white/5 bg-panel1">
                                {/* Rail collapse toggle — Phantom's edge tab */}
                                <button
                                    onClick={toggleRail}
                                    aria-label={railCollapsed ? "Show markets" : "Hide markets"}
                                    className="absolute left-0 top-4 z-10 hidden h-9 w-4 cursor-pointer items-center justify-center rounded-r-md bg-white/[0.06] text-zinc-500 transition-colors hover:bg-white/[0.1] hover:text-white lg:flex"
                                >
                                    <HugeiconsIcon
                                        icon={railCollapsed ? ArrowRight01Icon : ArrowLeft01Icon}
                                        className="size-3"
                                        strokeWidth={2.5}
                                    />
                                </button>
                                {market ? (
                                    <>
                                        {/* Market header — Phantom band: icon · symbol · Follow,
                                            then Mark (live ER price, what fills settle at) and
                                            Oracle (latest Pyth benchmark print). */}
                                        {/* One line always on lg (the band's height is pinned by
                                            chartH, so a wrapping header would grow the panel):
                                            prices and the Follow pill never shrink or wrap —
                                            the symbol truncates as the pressure valve. The
                                            pill is fixed-width so Follow ⇄ Following doesn't
                                            reflow the row. Mobile keeps wrapping (page scrolls). */}
                                        <div className="flex flex-wrap items-center gap-2.5 px-4 pb-1 pt-3.5 lg:flex-nowrap lg:pl-6">
                                            {market.iconUrl ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={market.iconUrl} alt="" className="size-7 shrink-0 rounded-full object-cover" />
                                            ) : (
                                                <span className="size-7 shrink-0 rounded-full bg-white/[0.08]" />
                                            )}
                                            <h2 className="min-w-0 truncate text-[20px] font-semibold tracking-tight text-white">
                                                {market.symbol}
                                            </h2>
                                            <button
                                                onClick={() => toggleFollow(market.symbol)}
                                                className={cn(
                                                    "w-[108px] shrink-0 cursor-pointer whitespace-nowrap rounded-full py-2 text-center text-[15px] font-semibold transition-colors",
                                                    perpFollows.has(market.symbol)
                                                        ? "bg-white text-black hover:bg-white/90"
                                                        : "bg-white/[0.08] text-white hover:bg-white/[0.12]",
                                                )}
                                            >
                                                {perpFollows.has(market.symbol) ? "Following" : "Follow"}
                                            </button>
                                            <div className="ml-auto flex shrink-0 gap-5 pl-2 text-right">
                                                <div>
                                                    <p className="text-sm font-semibold text-zinc-500">Mark</p>
                                                    <p className="whitespace-nowrap text-[15px] font-bold tabular-nums text-white">
                                                        ${fmtPrice(market.price)}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-sm font-semibold text-zinc-500">Oracle</p>
                                                    <p className="whitespace-nowrap text-[15px] font-bold tabular-nums text-white">
                                                        {oraclePrice !== null ? `$${fmtPrice(oraclePrice)}` : "—"}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                        <PerpsTVChart
                                            pythTicker={market.pythTicker}
                                            symbol={`${market.symbol}-PERP`}
                                            height={isLg ? chartH : undefined}
                                            className="px-2 pb-2 pt-1"
                                        />
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
                                        <PerpsTape pythTicker={market.pythTicker} symbol={market.symbol} livePrice={market.price} />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Splitter — drag to trade height between the chart/book
                            band and the positions strip */}
                        <div
                            onPointerDown={startBandResize}
                            aria-label="Resize chart"
                            className="group hidden h-2 shrink-0 cursor-row-resize items-center lg:flex"
                        >
                            <div className="h-px w-full bg-white/5 transition-colors group-hover:bg-white/25 group-active:bg-white/25" />
                        </div>

                        {/* Positions / Trades / Funding / Order History — desktop */}
                        <div className="max-lg:hidden">
                            <TerminalTabs positions={positions} fills={fills} markets={markets} onClose={closeRow} />
                        </div>
                    </div>

                    {/* Order panel — scrolls internally if taller than the row */}
                    <aside className="mt-3 lg:mt-0 lg:flex lg:min-h-0 lg:flex-col lg:overflow-y-auto lg:[scrollbar-width:none]">
                        {market && (
                            <OrderPanel
                                key={market.symbol}
                                market={market}
                                account={account}
                                canTrade={canTrade}
                                connection={connection}
                                authority={authority}
                                walletAddress={walletAuthority}
                                submitBase={submit}
                                ensureReady={ensureReady}
                                signedIn={!!session?.user}
                                onLogin={() => router.push("/login")}
                                onFill={logFill}
                                onOpened={() => {
                                    if (authority) recordPerpsAccount.mutate({ authority });
                                    refreshAccount();
                                }}
                            />
                        )}
                        {/* Trading balance — Phantom's bottom-right card: label/value
                            rows, then stacked Deposit (primary) / Withdraw. */}
                        <div className="mt-2 rounded-lg bg-panel1 p-4 border border-white/5 lg:flex-1">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-semibold text-zinc-500">Total Balance</p>
                                <p className="text-sm font-bold tabular-nums text-white">
                                    ${fmtUsd((account?.ledgerUsdc ?? 0) + (account?.walletUsdc ?? 0))}
                                </p>
                            </div>
                            <div className="mt-1.5 flex items-center justify-between">
                                <p className="text-sm font-semibold text-zinc-500">Available Balance</p>
                                <p className="text-sm font-bold tabular-nums text-white">
                                    ${fmtUsd(account?.ledgerUsdc ?? 0)}
                                </p>
                            </div>
                            <button
                                onClick={() => canTrade && setManaging("deposit")}
                                disabled={!canTrade}
                                className="mt-4 h-14 w-full cursor-pointer rounded-full bg-white text-base font-bold text-black transition-colors hover:bg-white/90 disabled:cursor-default disabled:opacity-40"
                            >
                                Deposit
                            </button>
                            <button
                                onClick={() => canTrade && setManaging("withdraw")}
                                disabled={!canTrade || (account?.ledgerUsdc ?? 0) <= 0}
                                className="mt-2 h-14 w-full cursor-pointer rounded-full bg-white/[0.06] text-base font-bold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-default disabled:opacity-40"
                            >
                                Withdraw
                            </button>
                        </div>
                    </aside>
                </div>

                {/* Positions / Trades / Funding / Order History — mobile */}
                <div className="mt-3 lg:hidden">
                    <TerminalTabs positions={positions} fills={fills} markets={markets} onClose={closeRow} />
                </div>

            </div>

            {managing && authority && (
                <CollateralDialog
                    initialMode={managing}
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
                {m.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.iconUrl} alt="" className="size-5 shrink-0 rounded-full object-cover" />
                ) : (
                    <span className="size-5 shrink-0 rounded-full bg-white/[0.08]" />
                )}
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

function TokenRailRow({
    token: t,
    onOpen,
}: {
    token: { ticker: string; imageUrl: string | null; priceUsd: number | null; priceChange24h: number | null };
    onOpen: () => void;
}) {
    const ch = t.priceChange24h;
    return (
        <button
            onClick={onOpen}
            className="flex w-full cursor-pointer items-center justify-between rounded-md px-2.5 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
        >
            <span className="flex min-w-0 items-center gap-2">
                {t.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.imageUrl} alt="" className="size-5 shrink-0 rounded-full object-cover" />
                ) : (
                    <span className="size-5 shrink-0 rounded-full bg-white/[0.08]" />
                )}
                <span className="truncate text-[14px] font-bold text-white">{t.ticker}</span>
            </span>
            <span className="text-right">
                <span className="block text-[13px] font-bold tabular-nums text-zinc-200">
                    ${fmtPrice(t.priceUsd ?? 0)}
                </span>
                {ch !== null && (
                    <span className={cn(
                        "block text-[11px] font-extrabold tabular-nums",
                        ch >= 0 ? "text-lantern" : "text-pastelred",
                    )}>
                        {ch >= 0 ? "+" : ""}{ch.toFixed(2)}%
                    </span>
                )}
            </span>
        </button>
    );
}

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const WSOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_ICON = "https://dxjms0h859jb3.cloudfront.net/token-icons/usdc.png";

type WalletAsset = {
    mint: string;
    symbol: string;
    icon?: string;
    balance: number;
    decimals: number;
    price?: number;
    usdValue?: number;
};

/** What funds the order: the USDC trading balance, or a wallet asset that
 *  gets swapped to USDC (Jupiter) + deposited in one flow at submit. */
type PayAsset = { kind: "ledger" } | ({ kind: "wallet" } & WalletAsset);

function OrderPanel({
    market,
    account,
    canTrade,
    connection,
    authority,
    walletAddress,
    submitBase,
    ensureReady,
    signedIn,
    onLogin,
    onFill,
    onOpened,
}: {
    market: PerpMarketRow;
    account: PerpsAccountState | null;
    canTrade: boolean;
    connection: ReturnType<typeof useConnection>["connection"];
    authority: string | null;
    /** Real wallet address for informational reads — NOT nulled by geo-block. */
    walletAddress: string | null;
    /** Base-layer tx through whichever wallet the user has (from PerpsView). */
    submitBase: (tx: Transaction) => Promise<string>;
    ensureReady: () => Promise<void>;
    signedIn: boolean;
    onLogin: () => void;
    onFill: (f: Omit<TradeFill, "id">) => void;
    onOpened: () => void;
}) {
    const [direction, setDirection] = useState<"long" | "short">("long");
    const [usd, setUsd] = useState("");
    const [leverage, setLeverage] = useState(5);
    const [quote, setQuote] = useState<OpenQuote | null>(null);
    const [quoting, setQuoting] = useState(false);
    const [placing, setPlacing] = useState(false);
    const [payAsset, setPayAsset] = useState<PayAsset>({ kind: "ledger" });
    const quoteSeq = useRef(0);

    // Swap engine (same rails as quick-buy): Jupiter quote + swap tx, signed
    // by the adapter or relayed for Swig.
    const wallet = useWallet();
    const { signAndSubmit } = useWalletSigning();
    const getQuoteMutation = trpc.wallet.getQuote.useMutation();
    const getSwapTxMutation = trpc.wallet.getSwapTransaction.useMutation();

    const long = direction === "long";
    const amount = Number(usd) || 0;
    // Wallet assets for the pay-with dropdown (Phantom's "You Pay" selector).
    // Keyed to the real wallet address so holdings show even under geo-block.
    const assets = trpc.wallet.getWalletAssets.useQuery(
        { address: walletAddress ?? undefined },
        { enabled: signedIn && !!walletAddress, staleTime: 60_000 },
    );
    const walletAssets = ((assets.data?.tokens ?? []) as WalletAsset[]).filter((t) => t.balance > 0);
    const maxLev = market.maxLeverage;
    const balance = account?.ledgerUsdc ?? 0;
    /** USD spendable through the selected source. */
    const available = payAsset.kind === "ledger" ? balance : payAsset.usdValue ?? 0;
    const insufficient = canTrade && !!account?.ready && amount > 0 && amount > available;

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

    const reportFill = trpc.perps.reportFill.useMutation();
    const place = async () => {
        if (amount < 1 || !authority) return;
        setPlacing(true);
        try {
            // Paying from a wallet asset: swap → USDC (Jupiter, wallet-signed),
            // then deposit the order's USD into the Flash ledger. Wallet USDC
            // skips the swap. Ledger source skips both.
            if (payAsset.kind === "wallet") {
                if (!walletAddress) throw new Error("Connect a wallet first");
                if (payAsset.mint !== USDC_MINT) {
                    if (!payAsset.price || payAsset.price <= 0) {
                        throw new Error(`No price for ${payAsset.symbol} — try USDC`);
                    }
                    toast(`Swapping ${payAsset.symbol} → USDC…`);
                    // 1% buffer over spot so the output clears the deposit even
                    // after slippage; leftover USDC dust stays in the wallet.
                    const inputMint = payAsset.mint.endsWith("11111111111111111111111111111111111111111")
                        ? WSOL_MINT
                        : payAsset.mint;
                    const inAmount = Math.ceil((amount / payAsset.price) * 1.01 * 10 ** payAsset.decimals);
                    const jupQuote = await getQuoteMutation.mutateAsync({
                        inputMint,
                        outputMint: USDC_MINT,
                        amount: inAmount,
                        slippageBps: 100,
                    });
                    const { swapTransaction } = await getSwapTxMutation.mutateAsync({
                        quoteResponse: jupQuote,
                        userPublicKey: walletAddress,
                        wrapAndUnwrapSol: true,
                    });
                    const { VersionedTransaction } = await import("@solana/web3.js");
                    const swapTx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, "base64"));
                    let swapSig: string;
                    if (wallet.publicKey && wallet.sendTransaction) {
                        swapSig = await wallet.sendTransaction(swapTx, connection);
                    } else {
                        swapSig = (await signAndSubmit({ transaction: swapTransaction })).signature;
                    }
                    await connection.confirmTransaction(swapSig, "confirmed");
                }
                toast(`Depositing $${fmtUsd(amount)} USDC…`);
                await ensureReady();
                const [{ prepareDeposit }, { PublicKey: PK }] = await Promise.all([
                    import("@/lib/perps/flash"),
                    import("@solana/web3.js"),
                ]);
                await submitBase(await prepareDeposit(connection, new PK(authority), amount));
            }

            // First-time traders run the one-time setup (wallet-signed), then
            // every trade after this is session-signed — no wallet prompt.
            await ensureReady();
            const [{ openPosition }, { PublicKey }] = await Promise.all([
                import("@/lib/perps/flash"),
                import("@solana/web3.js"),
            ]);
            const fillSig = await openPosition(
                connection, new PublicKey(authority), market.symbol, direction, amount, leverage,
            );
            // Verified XP: the server checks this sig on the ER before paying.
            reportFill.mutate({ signature: fillSig });
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
        <div className="rounded-lg bg-panel1 p-4 border border-white/5">
            {/* Direction — rounded pills; active side gets a very light white
                wash + its accent color. */}
            <div className="grid grid-cols-2 gap-1 rounded-full bg-white/[0.04] p-1">
                <button
                    onClick={() => setDirection("long")}
                    className={cn(
                        "flex h-11 cursor-pointer items-center justify-center rounded-full text-base font-extrabold transition-colors",
                        long ? "bg-white/[0.08] text-long" : "text-zinc-500 hover:text-white",
                    )}
                >
                    Long
                </button>
                <button
                    onClick={() => setDirection("short")}
                    className={cn(
                        "flex h-11 cursor-pointer items-center justify-center rounded-full text-base font-extrabold transition-colors",
                        !long ? "bg-white/[0.08] text-short" : "text-zinc-500 hover:text-white",
                    )}
                >
                    Short
                </button>
            </div>

            {/* Anatomy rows — Phantom's ticket */}
            <div className="mt-4 flex items-center justify-between px-1">
                <span className="text-sm font-semibold text-zinc-500">Available to Trade</span>
                <span className="text-sm font-bold tabular-nums text-white">${fmtUsd(available)}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between px-1">
                <span className="text-sm font-semibold text-zinc-500">Order Type</span>
                <span className="text-sm font-bold text-white">Market</span>
            </div>

            {/* Amount + pay-asset selector */}
            <div className="relative mt-3">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[14px] font-bold text-zinc-500">$</span>
                <Input
                    radius={16}
                    value={usd}
                    onChange={(e) => setUsd(e.target.value.replace(/[^0-9.]/g, ""))}
                    placeholder="0"
                    inputMode="decimal"
                    className="h-12 bg-white/[0.04] pl-8 pr-24 text-[15px] font-bold"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <GooDropdown
                        align="end"
                        side="bottom"
                        width={260}
                        gap={10}
                        triggerAriaLabel="Pay with"
                        triggerClassName="flex h-8 cursor-pointer items-center gap-1.5 rounded-full bg-white/[0.08] pl-1.5 pr-2 text-sm font-bold text-white transition-colors hover:bg-white/[0.12]"
                        trigger={
                            <>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={payAsset.kind === "ledger" ? USDC_ICON : payAsset.icon ?? USDC_ICON}
                                    alt=""
                                    className="size-5 shrink-0 rounded-full object-cover"
                                />
                                {payAsset.kind === "ledger" ? "USDC" : payAsset.symbol}
                                <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 text-zinc-500" strokeWidth={2} />
                            </>
                        }
                        items={[
                            {
                                key: "usdc-ledger",
                                onClick: () => setPayAsset({ kind: "ledger" }),
                                className: "justify-between gap-3 px-3 cursor-pointer hover:bg-white/5",
                                label: (
                                    <>
                                        <span className="flex items-center gap-2.5">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={USDC_ICON} alt="" className="size-6 shrink-0 rounded-full object-cover" />
                                            <span className="text-sm font-bold text-white">USDC</span>
                                        </span>
                                        <span className="text-sm font-semibold tabular-nums text-zinc-400">${fmtUsd(balance)}</span>
                                    </>
                                ),
                            },
                            ...walletAssets.map((t) => ({
                                key: t.mint,
                                onClick: () => setPayAsset({ kind: "wallet", ...t }),
                                className: "justify-between gap-3 px-3 cursor-pointer hover:bg-white/5",
                                label: (
                                    <>
                                        <span className="flex min-w-0 items-center gap-2.5">
                                            {t.icon ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={t.icon} alt="" className="size-6 shrink-0 rounded-full object-cover" />
                                            ) : (
                                                <span className="size-6 shrink-0 rounded-full bg-white/[0.1]" />
                                            )}
                                            <span className="truncate text-sm font-bold text-white">{t.symbol}</span>
                                        </span>
                                        <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-400">
                                            {t.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                        </span>
                                    </>
                                ),
                            })),
                        ]}
                    />
                </div>
            </div>

            {/* Size as % of available balance — Phantom's first slider.
                Nothing to size against => visibly disabled, not silently inert. */}
            <div className={cn("mt-3", available <= 0 && "pointer-events-none opacity-40")}>
                <AnimatedSlider
                    label="Size"
                    value={available > 0 ? Math.min(100, Math.round((amount / available) * 100)) : 0}
                    onChange={(v) => available > 0 && setUsd(String(Math.floor(available * v) / 100))}
                    min={0}
                    max={100}
                    step={1}
                />
            </div>

            {/* Leverage */}
            <div className="mt-3">
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
                    {payAsset.kind === "ledger"
                        ? `That's more than your $${fmtUsd(balance)} trading balance — deposit USDC first.`
                        : `That's more than your ${payAsset.symbol} is worth (~$${fmtUsd(available)}).`}
                </p>
            )}

            {!signedIn ? (
                <button
                    onClick={onLogin}
                    className="mt-4 flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-white text-base font-extrabold text-black transition-colors hover:bg-white/90"
                >
                    <PinkStarLogo fill="black" className="size-4" />
                    Login
                </button>
            ) : (
                <button
                    onClick={place}
                    disabled={placing || !canTrade || amount < 1 || insufficient || !quote}
                    className={cn(
                        "mt-4 h-14 w-full cursor-pointer rounded-full text-base font-extrabold transition-colors disabled:opacity-40",
                        long
                            ? "bg-long-soft text-long-ink hover:bg-long-soft/90"
                            : "bg-short-soft text-short-ink hover:bg-short-soft/90",
                    )}
                >
                    {placing
                        ? account?.ready ? "Placing…" : "Setting up…"
                        : account && !account.ready
                            ? `Enable trading & ${long ? "long" : "short"} ${market.symbol}`
                            : `${long ? "Long" : "Short"} ${market.symbol} · ${leverage}×`}
                </button>
            )}
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
    const labels: Record<TermTab, string> = {
        positions: `Positions (${positions.length})`,
        trades: "Trades",
        funding: "Funding",
        orders: "Order History",
    };
    return (
        <div className="flex flex-col overflow-hidden rounded-lg border border-white/5 bg-panel2">
            {/* Segmented strip, same anatomy as the rail/book tabs. */}
            <div className="flex">
                {TERM_TABS.map((t) => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={cn(
                            "flex-1 cursor-pointer truncate py-2.5 text-base font-semibold transition-colors",
                            tab === t ? "text-white" : "bg-panel1 text-zinc-500 hover:text-white",
                        )}
                    >
                        {labels[t]}
                    </button>
                ))}
            </div>
            <div className="min-h-[240px] p-2">
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
        <div className="flex min-h-[200px] flex-col items-center justify-center py-4 text-center">
            <p className="text-base font-bold text-zinc-400">{title}</p>
            <p className="mt-0.5 text-sm font-medium text-zinc-600">{sub}</p>
        </div>
    );
}

function FillRow({ fill: f }: { fill: TradeFill }) {
    const long = f.direction === "long";
    return (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md px-3 py-2 transition-colors hover:bg-white/[0.03]">
            <div className="flex items-center gap-2.5">
                <span className={cn("text-sm font-extrabold", long ? "text-lantern" : "text-pastelred")}>
                    {long ? "Long" : "Short"}
                </span>
                <span className="text-sm font-bold text-white">{f.symbol}</span>
                <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-xs font-extrabold text-zinc-500">
                    {f.kind === "open" ? "Open" : "Close"}
                </span>
            </div>
            <div className="flex items-center gap-4 tabular-nums">
                {f.kind === "close" && f.pnlUsd !== undefined && (
                    <span className={cn("text-sm font-bold", f.pnlUsd >= 0 ? "text-lantern" : "text-pastelred")}>
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
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-white/5 bg-white/[0.03] px-4 py-3">
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
    initialMode,
    account,
    onDone,
    onClose,
    transfer,
}: {
    initialMode: "deposit" | "withdraw";
    account: PerpsAccountState | null;
    onDone: () => void;
    onClose: () => void;
    transfer: (mode: "deposit" | "withdraw", usd: number) => Promise<string>;
}) {
    const [mode, setMode] = useState<"deposit" | "withdraw">(initialMode);
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
