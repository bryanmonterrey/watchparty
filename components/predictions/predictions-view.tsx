"use client";

import { useMemo, useState } from "react";
import { formatDistanceToNow, isPast } from "date-fns";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import { Target02Icon, PlusSignIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useWalletSigning } from "@/hooks/use-wallet-signing";
import { USDC_MINT } from "@/lib/premium/tiers";
import { getBoostTreasuryOwner } from "@/lib/premium/boosts";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// Predictions — in-house pari-mutuel markets in USDC. Bets pay the treasury
// (verified on-chain like boost packs); winners split the losing pool minus
// the fee and claim from the payout float. 100% watchparty rails.

type MarketListItem = {
    id: string;
    question: string;
    description: string | null;
    category: string;
    status: "open" | "resolved" | "voided";
    winningOutcome: number | null;
    closesAt: string | Date;
    feeBps: number;
    outcomes: { idx: number; label: string; poolUsdc: string }[];
};

const usd = (baseUnits: bigint) => {
    const n = Number(baseUnits) / 1_000_000;
    return n >= 1000 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(n >= 10 ? 0 : 2)}`;
};

/** Implied probability of an outcome = its share of the total pool. */
function odds(outcomes: MarketListItem["outcomes"]): number[] {
    const pools = outcomes.map((o) => BigInt(o.poolUsdc));
    const total = pools.reduce((s, p) => s + p, BigInt(0));
    if (total === BigInt(0)) return outcomes.map(() => 1 / outcomes.length);
    return pools.map((p) => Number(p) / Number(total));
}

export function PredictionsView() {
    const { data: session } = useAuthSession();
    const isAdmin = session?.user?.role === "admin";
    const [category, setCategory] = useState<string | null>(null);
    const [openMarket, setOpenMarket] = useState<MarketListItem | null>(null);
    const [creating, setCreating] = useState(false);

    const { data: markets = [], isLoading } = trpc.predictions.list.useQuery({});

    const categories = useMemo(
        () => [...new Set(markets.map((m) => m.category))].sort(),
        [markets],
    );
    const shown = category ? markets.filter((m) => m.category === category) : markets;

    return (
        <ScrollArea className="h-full bg-background">
            <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 md:pt-(--header-height)">
                {/* Header */}
                <div className="flex flex-wrap items-end justify-between gap-3 pt-4">
                    <div>
                        <h1 className="font-pixel text-4xl tracking-tighter text-white">Predictions</h1>
                        <p className="mt-1.5 text-[14px] font-medium text-zinc-500">
                            Back an outcome in USDC — winners split the other side.
                        </p>
                    </div>
                    {isAdmin && (
                        <button
                            onClick={() => setCreating(true)}
                            className="flex h-11 items-center gap-1.5 rounded-full bg-white px-5 text-[14px] font-bold text-black transition-colors hover:bg-white/90"
                        >
                            <HugeiconsIcon icon={PlusSignIcon} className="size-4" strokeWidth={2.5} />
                            New market
                        </button>
                    )}
                </div>

                {/* Category chips */}
                {categories.length > 1 && (
                    <div className="mt-5 flex flex-wrap gap-1.5">
                        <Chip active={category === null} onClick={() => setCategory(null)}>All</Chip>
                        {categories.map((c) => (
                            <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
                                {c}
                            </Chip>
                        ))}
                    </div>
                )}

                {/* Markets */}
                {isLoading ? (
                    <div className="mt-6 grid gap-3 sm:grid-cols-2">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="h-44 overflow-hidden rounded-3xl"><div className="size-full shimmer-skeleton" /></div>
                        ))}
                    </div>
                ) : shown.length === 0 ? (
                    <div className="mt-16 flex flex-col items-center text-center">
                        <div className="grid size-16 place-items-center rounded-full bg-lantern/10">
                            <HugeiconsIcon icon={Target02Icon} className="size-7 text-lantern" strokeWidth={1.8} />
                        </div>
                        <p className="mt-4 text-[16px] font-bold text-zinc-300">No markets yet</p>
                        <p className="mt-1 text-[14px] font-medium text-zinc-500">The first markets are minutes away — check back soon.</p>
                    </div>
                ) : (
                    <div className="mt-6 grid gap-3 sm:grid-cols-2">
                        {shown.map((m) => (
                            <MarketCard key={m.id} market={m as MarketListItem} onOpen={() => setOpenMarket(m as MarketListItem)} />
                        ))}
                    </div>
                )}
            </div>

            {openMarket && (
                <MarketDialog market={openMarket} isAdmin={isAdmin} onClose={() => setOpenMarket(null)} />
            )}
            {creating && <CreateMarketDialog onClose={() => setCreating(false)} />}
        </ScrollArea>
    );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "cursor-pointer rounded-full px-3.5 py-1.5 text-[12px] font-bold capitalize transition-colors",
                active ? "bg-white text-black" : "bg-white/[0.06] text-zinc-400 hover:text-white",
            )}
        >
            {children}
        </button>
    );
}

function MarketCard({ market, onOpen }: { market: MarketListItem; onOpen: () => void }) {
    const probs = odds(market.outcomes);
    const total = market.outcomes.reduce((s, o) => s + BigInt(o.poolUsdc), BigInt(0));
    const closed = market.status !== "open" || isPast(new Date(market.closesAt));

    return (
        <button
            onClick={onOpen}
            className="flex cursor-pointer flex-col rounded-3xl bg-white/[0.03] p-5 text-left ring-1 ring-white/10 transition-colors hover:bg-white/[0.05]"
        >
            <div className="flex items-start justify-between gap-3">
                <p className="text-[16px] font-bold leading-snug text-white">{market.question}</p>
                <StatusChip market={market} />
            </div>

            <div className="mt-4 space-y-2">
                {market.outcomes.slice(0, 3).map((o, i) => {
                    const won = market.status === "resolved" && market.winningOutcome === o.idx;
                    return (
                        <div key={o.idx} className="relative overflow-hidden rounded-full bg-white/[0.05]">
                            <div
                                className={cn("absolute inset-y-0 left-0", won ? "bg-lantern/25" : "bg-white/[0.08]")}
                                style={{ width: `${Math.max(4, probs[i] * 100)}%` }}
                            />
                            <div className="relative flex items-center justify-between px-3.5 py-1.5">
                                <span className={cn("truncate text-[13px] font-bold", won ? "text-lantern" : "text-zinc-200")}>
                                    {o.label}
                                </span>
                                <span className="ml-2 shrink-0 text-[13px] font-bold tabular-nums text-zinc-400">
                                    {Math.round(probs[i] * 100)}%
                                </span>
                            </div>
                        </div>
                    );
                })}
                {market.outcomes.length > 3 && (
                    <p className="px-1 text-[12px] font-semibold text-zinc-600">+{market.outcomes.length - 3} more outcomes</p>
                )}
            </div>

            <div className="mt-4 flex items-center justify-between text-[12px] font-semibold text-zinc-500">
                <span>{usd(total)} pool</span>
                <span>
                    {market.status === "open"
                        ? closed
                            ? "Awaiting result"
                            : `Closes ${formatDistanceToNow(new Date(market.closesAt), { addSuffix: true })}`
                        : market.status === "resolved"
                            ? "Resolved"
                            : "Voided — refunds open"}
                </span>
            </div>
        </button>
    );
}

function StatusChip({ market }: { market: MarketListItem }) {
    if (market.status === "resolved") {
        return <span className="shrink-0 rounded-full bg-lantern/15 px-2.5 py-1 text-[11px] font-bold text-lantern">RESOLVED</span>;
    }
    if (market.status === "voided") {
        return <span className="shrink-0 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-bold text-zinc-500">VOIDED</span>;
    }
    if (isPast(new Date(market.closesAt))) {
        return <span className="shrink-0 rounded-full bg-sunset/15 px-2.5 py-1 text-[11px] font-bold text-sunset">CLOSED</span>;
    }
    return <span className="shrink-0 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-bold text-zinc-300">LIVE</span>;
}

// ─── Market detail + betting ────────────────────────────────

function MarketDialog({ market, isAdmin, onClose }: { market: MarketListItem; isAdmin: boolean; onClose: () => void }) {
    const utils = trpc.useUtils();
    const { data: session } = useAuthSession();
    const { connection } = useConnection();
    const { publicKey, sendTransaction } = useWallet();
    const { signAndSubmit } = useWalletSigning();

    const { data: detail } = trpc.predictions.get.useQuery({ marketId: market.id });
    const placeBet = trpc.predictions.placeBet.useMutation();
    const claim = trpc.predictions.claim.useMutation();
    const resolve = trpc.predictions.resolve.useMutation();

    const [picked, setPicked] = useState<number | null>(null);
    const [amount, setAmount] = useState("");
    const [paying, setPaying] = useState(false);

    const m = detail ?? { ...market, myBets: [] as never[] };
    const outcomes = (detail?.outcomes ?? market.outcomes) as MarketListItem["outcomes"];
    const probs = odds(outcomes);
    const bettable = m.status === "open" && !isPast(new Date(m.closesAt));
    const invalidate = () => {
        utils.predictions.get.invalidate({ marketId: market.id });
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
                marketId: market.id,
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

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="max-h-[85vh] gap-0 overflow-y-auto rounded-4xl border-none p-6 sm:max-w-[520px]" showCloseButton={false}>
                <div className="flex items-start justify-between gap-3">
                    <DialogTitle className="text-[19px] font-bold leading-snug tracking-tight text-white">
                        {m.question}
                    </DialogTitle>
                    <StatusChip market={m as MarketListItem} />
                </div>
                {m.description && (
                    <p className="mt-2 text-[14px] font-medium leading-relaxed text-zinc-500">{m.description}</p>
                )}
                {"resolutionNote" in m && m.resolutionNote ? (
                    <p className="mt-2 rounded-2xl bg-white/[0.03] px-4 py-3 text-[13px] font-medium text-zinc-400 ring-1 ring-white/10">
                        {String(m.resolutionNote)}
                    </p>
                ) : null}

                {/* Outcomes */}
                <div className="mt-5 space-y-2">
                    {outcomes.map((o, i) => {
                        const won = m.status === "resolved" && m.winningOutcome === o.idx;
                        const active = picked === o.idx;
                        return (
                            <button
                                key={o.idx}
                                disabled={!bettable}
                                onClick={() => setPicked(active ? null : o.idx)}
                                className={cn(
                                    "relative w-full cursor-pointer overflow-hidden rounded-2xl text-left ring-1 transition-all disabled:cursor-default",
                                    active ? "ring-white" : won ? "ring-lantern/40" : "ring-white/10",
                                    "bg-white/[0.03] hover:bg-white/[0.05]",
                                )}
                            >
                                <div
                                    className={cn("absolute inset-y-0 left-0", won ? "bg-lantern/20" : "bg-white/[0.06]")}
                                    style={{ width: `${Math.max(3, probs[i] * 100)}%` }}
                                />
                                <div className="relative flex items-center justify-between px-4 py-3">
                                    <span className={cn("text-[14px] font-bold", won ? "text-lantern" : "text-white")}>
                                        {o.label}
                                        {won && <HugeiconsIcon icon={Tick02Icon} className="ml-1.5 inline size-4" strokeWidth={2.5} />}
                                    </span>
                                    <span className="text-[13px] font-bold tabular-nums text-zinc-400">
                                        {Math.round(probs[i] * 100)}% · {usd(BigInt(o.poolUsdc))}
                                    </span>
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Bet composer */}
                {bettable && picked != null && (
                    <div className="mt-4 flex items-center gap-2">
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
                )}
                {bettable && picked == null && (
                    <p className="mt-3 text-center text-[12px] font-semibold text-zinc-600">
                        Pick an outcome to bet — $1 minimum, USDC
                    </p>
                )}

                {/* My bets */}
                {detail && detail.myBets.length > 0 && (
                    <div className="mt-5">
                        <p className="px-1 text-[13px] font-bold text-zinc-400">Your bets</p>
                        <div className="mt-2 space-y-1.5">
                            {detail.myBets.map((b) => {
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
                    <div className="mt-5 rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/10">
                        <p className="text-[13px] font-bold text-zinc-400">Resolve (admin)</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {outcomes.map((o) => (
                                <button
                                    key={o.idx}
                                    onClick={async () => {
                                        try {
                                            await resolve.mutateAsync({ marketId: market.id, winningOutcome: o.idx });
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

                <div className="mt-5 flex items-center justify-between text-[12px] font-semibold text-zinc-600">
                    <span>Fee: {(m.feeBps / 100).toFixed(1)}% of the losing pool</span>
                    <span>
                        {m.status === "open" && !isPast(new Date(m.closesAt))
                            ? `Closes ${formatDistanceToNow(new Date(m.closesAt), { addSuffix: true })}`
                            : ""}
                    </span>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ─── Admin: create market ───────────────────────────────────

function CreateMarketDialog({ onClose }: { onClose: () => void }) {
    const utils = trpc.useUtils();
    const create = trpc.predictions.createMarket.useMutation({
        onSuccess: () => {
            utils.predictions.list.invalidate();
            toast.success("Market created");
            onClose();
        },
        onError: (e) => toast.error(e.message),
    });

    const [question, setQuestion] = useState("");
    const [description, setDescription] = useState("");
    const [category, setCategory] = useState("general");
    const [outcomes, setOutcomes] = useState(["Yes", "No"]);
    const [closesIn, setClosesIn] = useState<"1d" | "3d" | "7d" | "30d">("7d");

    const CLOSES: Record<typeof closesIn, number> = { "1d": 1, "3d": 3, "7d": 7, "30d": 30 };

    const submit = () => {
        const closesAt = new Date(Date.now() + CLOSES[closesIn] * 24 * 60 * 60 * 1000);
        create.mutate({
            question,
            description: description || undefined,
            category,
            closesAt: closesAt.toISOString(),
            outcomes: outcomes.filter((o) => o.trim()),
        });
    };

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="gap-4 rounded-4xl border-none p-6 sm:max-w-[460px]" showCloseButton={false}>
                <DialogTitle className="text-center text-[18px] font-bold tracking-tight text-white">New market</DialogTitle>

                <Input radius={14} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Will $TICKER graduate this week?" maxLength={200} autoFocus className="h-12 text-[14px] font-medium" />
                <Input radius={14} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Resolution criteria (optional but recommended)" maxLength={1000} className="h-12 text-[14px] font-medium" />
                <Input radius={14} value={category} onChange={(e) => setCategory(e.target.value.toLowerCase())} placeholder="category" maxLength={30} className="h-12 text-[14px] font-medium" />

                <div className="space-y-1.5">
                    {outcomes.map((o, i) => (
                        <Input
                            key={i}
                            radius={14}
                            value={o}
                            onChange={(e) => setOutcomes(outcomes.map((x, j) => (j === i ? e.target.value : x)))}
                            placeholder={`Outcome ${i + 1}`}
                            maxLength={60}
                            className="h-11 text-[14px] font-medium"
                        />
                    ))}
                    {outcomes.length < 10 && (
                        <button
                            onClick={() => setOutcomes([...outcomes, ""])}
                            className="cursor-pointer px-1 text-[12px] font-bold text-zinc-500 transition-colors hover:text-white"
                        >
                            + Add outcome
                        </button>
                    )}
                </div>

                <div className="flex gap-1.5">
                    {(Object.keys(CLOSES) as (typeof closesIn)[]).map((k) => (
                        <button
                            key={k}
                            onClick={() => setClosesIn(k)}
                            className={cn(
                                "flex-1 cursor-pointer rounded-full py-2 text-[13px] font-bold transition-colors",
                                closesIn === k ? "bg-white text-black" : "bg-white/[0.06] text-zinc-400 hover:text-white",
                            )}
                        >
                            {k}
                        </button>
                    ))}
                </div>

                <button
                    onClick={submit}
                    disabled={create.isPending || question.trim().length < 8 || outcomes.filter((o) => o.trim()).length < 2}
                    className="h-12 w-full cursor-pointer rounded-full bg-white text-[14px] font-bold text-black transition-colors hover:bg-white/90 disabled:opacity-40"
                >
                    {create.isPending ? "Creating…" : "Create market"}
                </button>
            </DialogContent>
        </Dialog>
    );
}
