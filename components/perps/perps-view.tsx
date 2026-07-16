"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import { TradeUpIcon, TradeDownIcon, Wallet01Icon } from "@hugeicons/core-free-icons";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useAuthSession } from "@/hooks/use-auth-session";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { PerpMarketRow, AccountSummary } from "@/lib/perps/drift";

// Perpetuals on Drift — non-custodial: every order is signed by the user's
// own wallet, positions live in THEIR Drift account. The SDK (heavy) loads
// only inside this route, and only via await import() in effects/handlers.

const fmt = (n: number, dp = 2) =>
    n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toFixed(n < 1 ? 4 : dp);

export function PerpsView() {
    const { connection } = useConnection();
    const wallet = useWallet();
    const { data: session } = useAuthSession();

    const [markets, setMarkets] = useState<PerpMarketRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [account, setAccount] = useState<AccountSummary | null>(null);
    const [trade, setTrade] = useState<{ market: PerpMarketRow; direction: "long" | "short" } | null>(null);
    const [managing, setManaging] = useState(false);

    // Extension wallet required: perps orders are signed by the user's own
    // wallet via the Drift SDK (Swig's sign-and-submit flow can't hand the
    // SDK a signTransaction, so custodial users see a connect prompt).
    const canTrade = !!wallet.publicKey && !!wallet.signTransaction;

    const refreshAccount = useCallback(async () => {
        if (!canTrade) return;
        try {
            const { getTradeClient, getAccountSummary } = await import("@/lib/perps/drift");
            const client = await getTradeClient(connection, {
                publicKey: wallet.publicKey!,
                signTransaction: wallet.signTransaction!,
                signAllTransactions: wallet.signAllTransactions!,
            // Drift's IWallet expects a payer Keypair only for keypair wallets
            } as never);
            setAccount(await getAccountSummary(client));
        } catch (err) {
            console.error("perps account refresh failed", err);
        }
    }, [canTrade, connection, wallet.publicKey, wallet.signTransaction, wallet.signAllTransactions]);

    // Market list: load on mount, refresh on an interval, tear down on unmount.
    useEffect(() => {
        let alive = true;
        let timer: ReturnType<typeof setInterval> | null = null;
        (async () => {
            try {
                const { getMarkets } = await import("@/lib/perps/drift");
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
            import("@/lib/perps/drift").then((m) => m.teardown()).catch(() => {});
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        refreshAccount();
    }, [refreshAccount]);

    return (
        <ScrollArea className="h-full bg-background">
            <div className="mx-auto max-w-4xl px-4 pb-16 pt-6 md:pt-(--header-height)">
                <div className="flex flex-wrap items-end justify-between gap-3 pt-4">
                    <div>
                        <h1 className="font-pixel text-4xl tracking-tighter text-white">Perpetuals</h1>
                        <p className="mt-1.5 text-[14px] font-medium text-zinc-500">
                            Long or short with leverage, settled in USDC on Drift. Your wallet, your positions.
                        </p>
                    </div>
                    {canTrade && (
                        <button
                            onClick={() => setManaging(true)}
                            className="flex h-11 items-center gap-2 rounded-full bg-white/[0.06] px-5 text-[14px] font-bold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
                        >
                            <HugeiconsIcon icon={Wallet01Icon} className="size-4" strokeWidth={2} />
                            {account?.exists ? `$${fmt(account.freeCollateralUsd)} free` : "Deposit USDC"}
                        </button>
                    )}
                </div>

                {!canTrade && session?.user && (
                    <div className="mt-5 rounded-2xl bg-white/[0.03] px-5 py-4 ring-1 ring-white/10">
                        <p className="text-[14px] font-bold text-white">Connect an extension wallet to trade</p>
                        <p className="mt-0.5 text-[13px] font-medium text-zinc-500">
                            Perps orders are signed directly by your wallet — Phantom, Solflare, or Backpack.
                        </p>
                    </div>
                )}

                {/* Positions */}
                {account && account.positions.length > 0 && (
                    <div className="mt-6">
                        <p className="px-1 text-[13px] font-bold text-zinc-400">Your positions</p>
                        <div className="mt-2 space-y-1.5">
                            {account.positions.map((p) => (
                                <PositionRow key={p.marketIndex} position={p} onClosed={refreshAccount} />
                            ))}
                        </div>
                    </div>
                )}

                {/* Markets */}
                <div className="mt-6 overflow-hidden rounded-3xl bg-white/[0.03] ring-1 ring-white/10">
                    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-zinc-600 sm:grid-cols-[1fr_110px_110px_150px]">
                        <span>Market</span>
                        <span className="text-right max-sm:hidden">Funding / h</span>
                        <span className="text-right">Price</span>
                        <span className="text-right">Trade</span>
                    </div>
                    {loading ? (
                        <div className="space-y-px">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="h-14 overflow-hidden"><div className="size-full shimmer-skeleton" /></div>
                            ))}
                        </div>
                    ) : markets.length === 0 ? (
                        <p className="px-5 py-10 text-center text-[14px] font-medium text-zinc-500">
                            Couldn&apos;t load markets — refresh to retry.
                        </p>
                    ) : (
                        markets.map((m) => (
                            <div
                                key={m.marketIndex}
                                className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-t border-white/[0.05] px-5 py-3.5 sm:grid-cols-[1fr_110px_110px_150px]"
                            >
                                <span className="text-[15px] font-bold text-white">{m.symbol.replace("-PERP", "")}</span>
                                <span
                                    className={cn(
                                        "text-right text-[13px] font-semibold tabular-nums max-sm:hidden",
                                        m.fundingHourlyPct >= 0 ? "text-lantern" : "text-pastelred",
                                    )}
                                >
                                    {m.fundingHourlyPct >= 0 ? "+" : ""}
                                    {m.fundingHourlyPct.toFixed(4)}%
                                </span>
                                <span className="text-right text-[15px] font-bold tabular-nums text-zinc-200">
                                    ${fmt(m.oraclePrice)}
                                </span>
                                <div className="flex justify-end gap-1.5">
                                    <button
                                        onClick={() => setTrade({ market: m, direction: "long" })}
                                        disabled={!canTrade}
                                        className="cursor-pointer rounded-full bg-lantern/15 px-3.5 py-1.5 text-[12px] font-extrabold text-lantern transition-colors hover:bg-lantern hover:text-black disabled:opacity-40"
                                    >
                                        Long
                                    </button>
                                    <button
                                        onClick={() => setTrade({ market: m, direction: "short" })}
                                        disabled={!canTrade}
                                        className="cursor-pointer rounded-full bg-pastelred/15 px-3.5 py-1.5 text-[12px] font-extrabold text-pastelred transition-colors hover:bg-pastelred hover:text-white disabled:opacity-40"
                                    >
                                        Short
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <p className="mt-4 px-1 text-[12px] font-medium leading-relaxed text-zinc-600">
                    Trading happens on the Drift protocol from your own wallet — watchparty never holds your
                    collateral or positions. Leverage can liquidate your full margin; size accordingly.
                </p>
            </div>

            {trade && (
                <TradeDialog
                    market={trade.market}
                    direction={trade.direction}
                    account={account}
                    onDone={() => { setTrade(null); refreshAccount(); }}
                    onClose={() => setTrade(null)}
                    getClient={async () => {
                        const { getTradeClient } = await import("@/lib/perps/drift");
                        return getTradeClient(connection, {
                            publicKey: wallet.publicKey!,
                            signTransaction: wallet.signTransaction!,
                            signAllTransactions: wallet.signAllTransactions!,
                        } as never);
                    }}
                />
            )}
            {managing && wallet.publicKey && (
                <CollateralDialog
                    account={account}
                    owner={wallet.publicKey}
                    onDone={() => { setManaging(false); refreshAccount(); }}
                    onClose={() => setManaging(false)}
                    getClient={async () => {
                        const { getTradeClient } = await import("@/lib/perps/drift");
                        return getTradeClient(connection, {
                            publicKey: wallet.publicKey!,
                            signTransaction: wallet.signTransaction!,
                            signAllTransactions: wallet.signAllTransactions!,
                        } as never);
                    }}
                />
            )}
        </ScrollArea>
    );
}

function PositionRow({ position: p, onClosed }: { position: import("@/lib/perps/drift").PerpPositionRow; onClosed: () => void }) {
    const [closing, setClosing] = useState(false);
    const { connection } = useConnection();
    const wallet = useWallet();

    const close = async () => {
        setClosing(true);
        try {
            const { getTradeClient, closePosition } = await import("@/lib/perps/drift");
            const client = await getTradeClient(connection, {
                publicKey: wallet.publicKey!,
                signTransaction: wallet.signTransaction!,
                signAllTransactions: wallet.signAllTransactions!,
            } as never);
            await closePosition(client, p.marketIndex);
            toast.success(`${p.symbol.replace("-PERP", "")} position closed`);
            onClosed();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Close failed");
        } finally {
            setClosing(false);
        }
    };

    const up = p.pnlUsd >= 0;
    return (
        <div className="flex items-center justify-between rounded-2xl bg-white/[0.03] px-4 py-3 ring-1 ring-white/10">
            <div className="flex items-center gap-3">
                <span
                    className={cn(
                        "grid size-8 place-items-center rounded-full",
                        p.direction === "long" ? "bg-lantern/15 text-lantern" : "bg-pastelred/15 text-pastelred",
                    )}
                >
                    <HugeiconsIcon icon={p.direction === "long" ? TradeUpIcon : TradeDownIcon} className="size-4" strokeWidth={2} />
                </span>
                <div>
                    <p className="text-[14px] font-bold text-white">
                        {p.direction === "long" ? "Long" : "Short"} {p.symbol.replace("-PERP", "")}
                    </p>
                    <p className="text-[12px] font-medium tabular-nums text-zinc-500">
                        {fmt(p.baseSize, 3)} @ ${fmt(p.entryPrice)} → ${fmt(p.oraclePrice)}
                    </p>
                </div>
            </div>
            <div className="flex items-center gap-3">
                <span className={cn("text-[14px] font-bold tabular-nums", up ? "text-lantern" : "text-pastelred")}>
                    {up ? "+" : ""}${fmt(p.pnlUsd)}
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

function TradeDialog({
    market,
    direction,
    account,
    onDone,
    onClose,
    getClient,
}: {
    market: PerpMarketRow;
    direction: "long" | "short";
    account: AccountSummary | null;
    onDone: () => void;
    onClose: () => void;
    getClient: () => Promise<import("@drift-labs/sdk").DriftClient>;
}) {
    const [usd, setUsd] = useState("");
    const [placing, setPlacing] = useState(false);
    const long = direction === "long";
    const free = account?.freeCollateralUsd ?? 0;
    const notional = Number(usd) || 0;
    const leverage = free > 0 && notional > 0 ? notional / free : 0;

    const place = async () => {
        if (notional < 1) return;
        setPlacing(true);
        try {
            const { openPosition } = await import("@/lib/perps/drift");
            const client = await getClient();
            await openPosition(client, market.marketIndex, direction, notional);
            toast.success(`${long ? "Long" : "Short"} ${market.symbol.replace("-PERP", "")} opened`);
            onDone();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Order failed");
        } finally {
            setPlacing(false);
        }
    };

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="gap-4 rounded-4xl border-none p-6 sm:max-w-[420px]" showCloseButton={false}>
                <DialogTitle className={cn("text-center text-[18px] font-bold tracking-tight", long ? "text-lantern" : "text-pastelred")}>
                    {long ? "Long" : "Short"} {market.symbol.replace("-PERP", "")}
                </DialogTitle>
                <p className="-mt-2 text-center text-[13px] font-medium text-zinc-500">
                    ${fmt(market.oraclePrice)} · fills at market
                </p>

                {(!account?.exists || free < 1) && (
                    <p className="rounded-2xl bg-sunset/10 px-4 py-3 text-[13px] font-semibold text-sunset">
                        Deposit USDC collateral first — use the wallet button on the perps page.
                    </p>
                )}

                <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[14px] font-bold text-zinc-500">$</span>
                    <Input
                        radius={16}
                        value={usd}
                        onChange={(e) => setUsd(e.target.value.replace(/[^0-9.]/g, ""))}
                        placeholder="100"
                        inputMode="decimal"
                        autoFocus
                        className="h-12 bg-white/[0.04] pl-8 text-[15px] font-bold"
                    />
                </div>
                <div className="flex gap-1.5">
                    {[25, 50, 100, 250].map((v) => (
                        <button
                            key={v}
                            onClick={() => setUsd(String(v))}
                            className="flex-1 cursor-pointer rounded-full bg-white/[0.06] py-2 text-[13px] font-bold text-zinc-400 transition-colors hover:text-white"
                        >
                            ${v}
                        </button>
                    ))}
                </div>

                {leverage > 0 && (
                    <p className={cn("text-center text-[13px] font-bold", leverage > 5 ? "text-sunset" : "text-zinc-500")}>
                        ≈ {leverage.toFixed(1)}× your free collateral
                    </p>
                )}

                <button
                    onClick={place}
                    disabled={placing || notional < 1 || !account?.exists}
                    className={cn(
                        "h-12 w-full cursor-pointer rounded-full text-[14px] font-extrabold text-black transition-colors disabled:opacity-40",
                        long ? "bg-lantern hover:bg-lantern/90" : "bg-pastelred hover:bg-pastelred/90",
                    )}
                >
                    {placing ? "Placing…" : `${long ? "Long" : "Short"} $${usd || "0"} notional`}
                </button>
            </DialogContent>
        </Dialog>
    );
}

function CollateralDialog({
    account,
    owner,
    onDone,
    onClose,
    getClient,
}: {
    account: AccountSummary | null;
    owner: import("@solana/web3.js").PublicKey;
    onDone: () => void;
    onClose: () => void;
    getClient: () => Promise<import("@drift-labs/sdk").DriftClient>;
}) {
    const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
    const [usd, setUsd] = useState("");
    const [busy, setBusy] = useState(false);

    const go = async () => {
        const amount = Number(usd);
        if (!Number.isFinite(amount) || amount <= 0) return;
        setBusy(true);
        try {
            const { depositUsdc, withdrawUsdc } = await import("@/lib/perps/drift");
            const client = await getClient();
            if (mode === "deposit") {
                await depositUsdc(client, owner, amount);
                toast.success(`Deposited $${amount} USDC`);
            } else {
                await withdrawUsdc(client, owner, amount);
                toast.success(`Withdrew $${amount} USDC`);
            }
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
                    Trading collateral
                </DialogTitle>
                {account?.exists && (
                    <p className="-mt-2 text-center text-[13px] font-medium text-zinc-500">
                        ${fmt(account.freeCollateralUsd)} free · ${fmt(account.totalCollateralUsd)} total
                    </p>
                )}

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
                        className="h-12 bg-white/[0.04] pl-8 text-[15px] font-bold"
                    />
                </div>

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
