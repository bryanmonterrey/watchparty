"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { isPast } from "date-fns";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, Clock01Icon } from "@hugeicons/core-free-icons";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useWalletSigning } from "@/hooks/use-wallet-signing";
import { USDC_MINT } from "@/lib/premium/tiers";
import { getBoostTreasuryOwner } from "@/lib/premium/boosts";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
    CategoryEyebrow,
    CloseLine,
    OutcomeRow,
    odds,
    multiples,
    usd,
    type MarketListItem,
} from "@/components/predictions/market-shared";

// A prediction market's own page (like tokens have theirs) — the full
// detail surface: outcomes, bet composer with live payout estimate, your
// bets + claims, and admin resolution.

export function MarketDetail({ marketId }: { marketId: string }) {
    const utils = trpc.useUtils();
    const { data: session } = useAuthSession();
    const isAdmin = session?.user?.role === "admin";
    const { connection } = useConnection();
    const { publicKey, sendTransaction } = useWallet();
    const { signAndSubmit } = useWalletSigning();

    const { data: detail, isLoading } = trpc.predictions.get.useQuery({ marketId });
    const placeBet = trpc.predictions.placeBet.useMutation();
    const claim = trpc.predictions.claim.useMutation();
    const resolve = trpc.predictions.resolve.useMutation();

    const [picked, setPicked] = useState<number | null>(null);
    const [amount, setAmount] = useState("");
    const [paying, setPaying] = useState(false);

    const outcomes = (detail?.outcomes ?? []) as MarketListItem["outcomes"];
    const probs = odds(outcomes);
    const mults = detail ? multiples(outcomes, detail.feeBps) : [];
    const bettable = !!detail && detail.status === "open" && !isPast(new Date(detail.closesAt));
    const resolved = detail?.status === "resolved";

    // Estimated payout for the composed bet: your stake joins the pool, so
    // quote the post-bet multiple, not the displayed pre-bet one.
    const stake = Number(amount) || 0;
    const estPayout = useMemo(() => {
        if (!detail || picked == null || stake < 1) return null;
        const pools = outcomes.map((o) => Number(BigInt(o.poolUsdc)) / 1_000_000);
        const total = pools.reduce((s, p) => s + p, 0);
        const mine = pools[outcomes.findIndex((o) => o.idx === picked)] + stake;
        const losing = total + stake - mine;
        return stake * ((mine + losing * (1 - detail.feeBps / 10_000)) / mine);
    }, [detail, picked, stake, outcomes]);

    const invalidate = () => {
        utils.predictions.get.invalidate({ marketId });
        utils.predictions.list.invalidate();
    };

    const bet = async () => {
        const usdAmount = Number(amount);
        if (picked == null || !Number.isFinite(usdAmount) || usdAmount < 1) return;
        if (!session?.user) { toast.error("Sign in to bet"); return; }
        setPaying(true);
        try {
            const baseUnits = BigInt(Math.round(usdAmount * 1_000_000));
            const [{ PublicKey, Transaction }, spl] = await Promise.all([
                import("@solana/web3.js"),
                import("@solana/spl-token"),
            ]);
            const custodialAddress = session.user.wallet_address;
            const owner = custodialAddress ? new PublicKey(custodialAddress) : publicKey;
            if (!owner) { toast.error("Connect a wallet to bet"); return; }

            const mint = new PublicKey(USDC_MINT);
            const treasuryOwner = new PublicKey(getBoostTreasuryOwner());
            const fromAta = spl.getAssociatedTokenAddressSync(mint, owner, true);
            const toAta = spl.getAssociatedTokenAddressSync(mint, treasuryOwner, true);

            const { blockhash } = await connection.getLatestBlockhash();
            const tx = new Transaction();
            tx.recentBlockhash = blockhash;
            tx.feePayer = owner;
            tx.add(spl.createAssociatedTokenAccountIdempotentInstruction(owner, toAta, treasuryOwner, mint));
            tx.add(spl.createTransferInstruction(fromAta, toAta, owner, baseUnits));

            let txSignature: string;
            if (custodialAddress) {
                const serialized = Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64");
                txSignature = (await signAndSubmit({ transaction: serialized })).signature;
            } else {
                txSignature = await sendTransaction(tx, connection);
                await connection.confirmTransaction(txSignature, "confirmed");
            }

            await placeBet.mutateAsync({
                marketId,
                outcomeIdx: picked,
                amountUsdc: baseUnits.toString(),
                txSignature,
            });
            toast.success("Bet placed 🎯");
            setPicked(null);
            setAmount("");
            invalidate();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Bet failed");
        } finally {
            setPaying(false);
        }
    };

    const doClaim = async (betId: string) => {
        try {
            const res = await claim.mutateAsync({ betId });
            toast.success(`Paid ${usd(BigInt(res.payoutUsdc))} to your wallet`);
            invalidate();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Claim failed");
        }
    };

    if (isLoading) {
        return (
            <ScrollArea className="h-full bg-canvas">
                <div className="mx-auto max-w-2xl px-4 pt-6 md:pt-(--header-height)">
                    <div className="mt-4 h-64 overflow-hidden rounded-3xl"><div className="size-full shimmer-skeleton" /></div>
                </div>
            </ScrollArea>
        );
    }
    if (!detail) {
        return (
            <ScrollArea className="h-full bg-canvas">
                <div className="mx-auto max-w-2xl px-4 pt-6 text-center md:pt-(--header-height)">
                    <p className="mt-16 text-[16px] font-bold text-zinc-300">Market not found</p>
                    <Link href="/trade/predictions" className="mt-2 inline-block text-[14px] font-semibold text-zinc-500 hover:text-white">
                        Back to predictions
                    </Link>
                </div>
            </ScrollArea>
        );
    }
    const m = detail;

    return (
        <ScrollArea className="h-full bg-canvas">
            <div className="mx-auto max-w-2xl px-4 pb-16 pt-6 md:pt-(--header-height)">
                {/* Back + eyebrow */}
                <div className="flex items-center gap-3 pt-4">
                    <Link
                        href="/trade/predictions"
                        className="grid size-9 shrink-0 place-items-center rounded-full bg-white/[0.06] text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
                        aria-label="Back to predictions"
                    >
                        <HugeiconsIcon icon={ArrowLeft01Icon} className="size-5" strokeWidth={2} />
                    </Link>
                    <CategoryEyebrow category={m.category} />
                </div>

                {/* Title */}
                <h1 className="mt-4 text-[24px] font-bold leading-snug tracking-tight text-white">{m.question}</h1>
                <CloseLine market={m} />
                {m.description && (
                    <p className="mt-3 text-[14px] font-medium leading-relaxed text-zinc-500">{m.description}</p>
                )}
                {"resolutionNote" in m && m.resolutionNote ? (
                    <p className="mt-3 rounded-2xl bg-white/[0.03] px-4 py-3 text-[13px] font-medium text-zinc-400 ring-1 ring-white/10">
                        {String(m.resolutionNote)}
                    </p>
                ) : null}

                {/* Outcomes */}
                <div className="mt-6 space-y-1.5">
                    {outcomes.map((o, i) => {
                        const won = resolved && m.winningOutcome === o.idx;
                        const lost = resolved && m.winningOutcome !== o.idx;
                        const active = picked === o.idx;
                        return (
                            <button
                                key={o.idx}
                                disabled={!bettable}
                                onClick={() => setPicked(active ? null : o.idx)}
                                className={cn(
                                    "w-full cursor-pointer rounded-2xl px-4 py-3 text-left ring-1 transition-all disabled:cursor-default",
                                    active ? "bg-white/[0.06] ring-white" : "bg-white/[0.03] ring-white/10",
                                    bettable && !active && "hover:bg-white/[0.05] hover:ring-white/15",
                                )}
                            >
                                <OutcomeRow
                                    label={o.label}
                                    prob={probs[i]}
                                    multiple={mults[i]}
                                    rank={probs[i] >= Math.max(...probs) ? 0 : 1}
                                    won={won}
                                    lost={lost}
                                />
                                <p className="mt-1.5 text-[11px] font-semibold text-zinc-600">{usd(BigInt(o.poolUsdc))} backing</p>
                            </button>
                        );
                    })}
                </div>

                {/* Bet composer */}
                {bettable && picked != null && (
                    <div className="mt-4">
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[14px] font-bold text-zinc-500">$</span>
                                <Input
                                    radius={16}
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                                    placeholder="25"
                                    inputMode="decimal"
                                    autoFocus
                                    className="h-12 bg-white/[0.04] pl-8 text-[15px] font-bold"
                                />
                            </div>
                            <button
                                onClick={bet}
                                disabled={paying || !Number(amount) || Number(amount) < 1}
                                className="h-12 shrink-0 cursor-pointer rounded-full bg-lantern px-6 text-[14px] font-extrabold text-black transition-colors hover:bg-lantern/90 disabled:opacity-40"
                            >
                                {paying ? "Paying…" : `Bet on ${outcomes.find((o) => o.idx === picked)?.label ?? ""}`}
                            </button>
                        </div>
                        {estPayout !== null && (
                            <p className="mt-2 px-1 text-center text-[12px] font-semibold text-zinc-500">
                                Wins about <span className="text-lantern">${estPayout.toFixed(2)}</span> if{" "}
                                {outcomes.find((o) => o.idx === picked)?.label} hits (at today&apos;s pools)
                            </p>
                        )}
                    </div>
                )}
                {bettable && picked == null && (
                    <p className="mt-3 text-center text-[12px] font-semibold text-zinc-600">
                        Pick an outcome to bet — $1 minimum, USDC
                    </p>
                )}

                {/* My bets */}
                {m.myBets.length > 0 && (
                    <div className="mt-6">
                        <p className="px-1 text-[13px] font-bold text-zinc-400">Your bets</p>
                        <div className="mt-2 space-y-1.5">
                            {m.myBets.map((b) => {
                                const claimable = BigInt(b.claimable);
                                return (
                                    <div key={b.id} className="flex items-center justify-between rounded-2xl bg-white/[0.03] px-4 py-3 ring-1 ring-white/10">
                                        <div>
                                            <p className="text-[14px] font-bold text-white">
                                                {usd(BigInt(b.amountUsdc))} on {outcomes.find((o) => o.idx === b.outcomeIdx)?.label}
                                            </p>
                                            <p className="text-[12px] font-medium text-zinc-500">
                                                {b.claimedAt
                                                    ? `Paid out ${b.payoutUsdc ? usd(BigInt(b.payoutUsdc)) : ""}`
                                                    : claimable > BigInt(0)
                                                        ? `${usd(claimable)} to claim`
                                                        : m.status === "open" ? "Live" : "No payout"}
                                            </p>
                                        </div>
                                        {!b.claimedAt && claimable > BigInt(0) && (
                                            <button
                                                onClick={() => doClaim(b.id)}
                                                disabled={claim.isPending}
                                                className="h-9 shrink-0 cursor-pointer rounded-full bg-lantern px-4 text-[13px] font-extrabold text-black transition-colors hover:bg-lantern/90 disabled:opacity-50"
                                            >
                                                {claim.isPending ? "Paying…" : "Claim"}
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Admin: resolve */}
                {isAdmin && m.status === "open" && (
                    <div className="mt-6 rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/10">
                        <p className="text-[13px] font-bold text-zinc-400">Resolve (admin)</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {outcomes.map((o) => (
                                <button
                                    key={o.idx}
                                    onClick={async () => {
                                        try {
                                            await resolve.mutateAsync({ marketId, winningOutcome: o.idx });
                                            toast.success(`Resolved: ${o.label}`);
                                            invalidate();
                                        } catch (err) {
                                            toast.error(err instanceof Error ? err.message : "Resolve failed");
                                        }
                                    }}
                                    disabled={resolve.isPending}
                                    className="cursor-pointer rounded-full bg-white/[0.06] px-3.5 py-1.5 text-[12px] font-bold text-zinc-300 transition-colors hover:bg-lantern hover:text-black disabled:opacity-50"
                                >
                                    {o.label} won
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="mt-6 flex items-center justify-between text-[12px] font-semibold text-zinc-600">
                    <span>Fee: {(m.feeBps / 100).toFixed(1)}% of the losing pool</span>
                    <span className="flex items-center gap-1.5">
                        <HugeiconsIcon icon={Clock01Icon} className="size-3.5" strokeWidth={2} />
                        {usd(outcomes.reduce((s, o) => s + BigInt(o.poolUsdc), BigInt(0)))} pool
                    </span>
                </div>
            </div>
        </ScrollArea>
    );
}
