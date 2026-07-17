"use client";

import { useMemo, useState } from "react";
import { format, isPast, differenceInHours } from "date-fns";
import { toast } from "sonner";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
    ArrowDown01Icon,
    Bitcoin01Icon,
    ChartUpIcon,
    Clock01Icon,
    CrownIcon,
    FireIcon,
    FootballIcon,
    GameController03Icon,
    Globe02Icon,
    MusicNote01Icon,
    PlusSignIcon,
    Rocket01Icon,
    Target02Icon,
    Tick02Icon,
    Tv01Icon,
} from "@hugeicons/core-free-icons";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useWalletSigning } from "@/hooks/use-wallet-signing";
import { USDC_MINT } from "@/lib/premium/tiers";
import { getBoostTreasuryOwner } from "@/lib/premium/boosts";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { GooDropdown } from "@/components/ui/goo-dropdown";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// Predictions — in-house pari-mutuel markets in USDC. Bets pay the treasury
// (verified on-chain like boost packs); winners split the losing pool minus
// the fee and claim from the payout float. 100% watchparty rails.
//
// Layout borrows Kalshi's market-browser anatomy (top category tabs, sort
// control, outcome rows with probability underlines + payout multiples +
// percentage pills) expressed in watchparty's identity — flat fills, inner
// hairlines, lantern/twitter2 accents, rounded-full pills.

type MarketListItem = {
    id: string;
    question: string;
    description: string | null;
    category: string;
    status: "open" | "resolved" | "voided";
    winningOutcome: number | null;
    closesAt: string | Date;
    createdAt?: string | Date;
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

/**
 * Pari-mutuel payout multiple for $1 on outcome i if it wins:
 * you get your stake back plus a pro-rata share of the losing pool minus fee.
 * Undefined (null) until the outcome has money on it.
 */
function multiples(outcomes: MarketListItem["outcomes"], feeBps: number): (number | null)[] {
    const pools = outcomes.map((o) => Number(BigInt(o.poolUsdc)));
    const total = pools.reduce((s, p) => s + p, 0);
    return pools.map((p) => {
        if (p <= 0 || total <= 0) return null;
        const losing = total - p;
        return (p + losing * (1 - feeBps / 10_000)) / p;
    });
}

const fmtMultiple = (x: number) => (x >= 100 ? `${Math.round(x)}x` : x >= 10 ? `${x.toFixed(1)}x` : `${x.toFixed(2)}x`);

/** Category glyph + accent — deterministic so cards read as a set. */
const CATEGORY_ICONS: Record<string, IconSvgElement> = {
    crypto: Bitcoin01Icon,
    tokens: ChartUpIcon,
    markets: ChartUpIcon,
    sports: FootballIcon,
    gaming: GameController03Icon,
    esports: GameController03Icon,
    music: MusicNote01Icon,
    culture: Tv01Icon,
    tv: Tv01Icon,
    world: Globe02Icon,
    politics: Globe02Icon,
    creators: CrownIcon,
    tech: Rocket01Icon,
    space: Rocket01Icon,
};
const ACCENTS = ["text-lantern", "text-twitter2", "text-sunset", "text-pastelred"] as const;

function categoryIcon(category: string): IconSvgElement {
    return CATEGORY_ICONS[category.toLowerCase()] ?? Target02Icon;
}
function categoryAccent(category: string): string {
    let h = 0;
    for (const c of category) h = (h * 31 + c.charCodeAt(0)) | 0;
    return ACCENTS[Math.abs(h) % ACCENTS.length];
}

type SortKey = "trending" | "closing" | "newest";
const SORT_LABEL: Record<SortKey, string> = { trending: "Trending", closing: "Closing soon", newest: "Newest" };

export function PredictionsView() {
    const { data: session } = useAuthSession();
    const isAdmin = session?.user?.role === "admin";
    const [category, setCategory] = useState<string | null>(null);
    const [sort, setSort] = useState<SortKey>("trending");
    const [openMarket, setOpenMarket] = useState<MarketListItem | null>(null);
    const [creating, setCreating] = useState(false);

    const { data: markets = [], isLoading } = trpc.predictions.list.useQuery({});

    const categories = useMemo(() => {
        const counts = new Map<string, number>();
        for (const m of markets) counts.set(m.category, (counts.get(m.category) ?? 0) + 1);
        return [...counts.entries()].sort((a, b) => b[1] - a[1]);
    }, [markets]);

    const shown = useMemo(() => {
        const pool = (m: (typeof markets)[number]) =>
            m.outcomes.reduce((s, o) => s + Number(BigInt(o.poolUsdc)), 0);
        const list = category ? markets.filter((m) => m.category === category) : [...markets];
        const openFirst = (a: (typeof markets)[number], b: (typeof markets)[number]) =>
            Number(a.status !== "open") - Number(b.status !== "open");
        switch (sort) {
            case "closing":
                return list.sort((a, b) =>
                    openFirst(a, b) || new Date(a.closesAt).getTime() - new Date(b.closesAt).getTime());
            case "newest":
                return list.sort((a, b) =>
                    openFirst(a, b) ||
                    new Date(b.createdAt ?? b.closesAt).getTime() - new Date(a.createdAt ?? a.closesAt).getTime());
            default:
                return list.sort((a, b) => openFirst(a, b) || pool(b) - pool(a));
        }
    }, [markets, category, sort]);

    return (
        <ScrollArea className="h-full bg-background">
            <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 md:pt-(--header-height)">
                {/* Category tabs (Kalshi's top rail) + sort + admin create */}
                <div className="flex items-center gap-3 pt-4">
                    <div className="-mx-1 flex min-w-0 flex-1 items-center gap-5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
                        <Tab active={category === null} onClick={() => setCategory(null)}>
                            <HugeiconsIcon icon={FireIcon} className="size-4" strokeWidth={2} />
                            Trending
                        </Tab>
                        {categories.map(([c, n]) => (
                            <Tab key={c} active={category === c} onClick={() => setCategory(c)}>
                                <span className="capitalize">{c}</span>
                                <span className={cn("text-[12px] font-semibold", category === c ? "text-zinc-500" : "text-zinc-700")}>{n}</span>
                            </Tab>
                        ))}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                        <GooDropdown
                            align="end"
                            side="bottom"
                            width={176}
                            gap={8}
                            fill="#101011"
                            panelRadius={20}
                            itemHeight={40}
                            triggerAriaLabel="Sort markets"
                            triggerClassName="flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-white/[0.06] px-3.5 text-[13px] font-bold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
                            trigger={
                                <>
                                    {SORT_LABEL[sort]}
                                    <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 text-zinc-500" strokeWidth={2} />
                                </>
                            }
                            items={(Object.keys(SORT_LABEL) as SortKey[]).map((k) => ({
                                key: k,
                                onClick: () => setSort(k),
                                className: "justify-between px-3 rounded-full cursor-pointer text-sm font-semibold text-zinc-300 hover:bg-white/5 hover:text-white",
                                label: (
                                    <>
                                        {SORT_LABEL[k]}
                                        {sort === k && <HugeiconsIcon icon={Tick02Icon} className="size-4 text-white" strokeWidth={2} />}
                                    </>
                                ),
                            }))}
                        />
                        {isAdmin && (
                            <button
                                onClick={() => setCreating(true)}
                                className="flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-white px-4 text-[13px] font-bold text-black transition-colors hover:bg-white/90"
                            >
                                <HugeiconsIcon icon={PlusSignIcon} className="size-4" strokeWidth={2.5} />
                                New market
                            </button>
                        )}
                    </div>
                </div>

                {/* Markets */}
                {isLoading ? (
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="h-56 overflow-hidden rounded-3xl"><div className="size-full shimmer-skeleton" /></div>
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
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
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

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "flex shrink-0 cursor-pointer items-center gap-1.5 py-1 text-[15px] font-bold transition-colors",
                active ? "text-white" : "text-zinc-500 hover:text-zinc-300",
            )}
        >
            {children}
        </button>
    );
}

/** The close-time line under a card title (Kalshi's "Jul 19 @ 10:00PM"). */
function CloseLine({ market }: { market: MarketListItem }) {
    const closes = new Date(market.closesAt);
    if (market.status === "resolved") {
        return <p className="mt-1 text-[12.5px] font-semibold text-lantern">Resolved</p>;
    }
    if (market.status === "voided") {
        return <p className="mt-1 text-[12.5px] font-semibold text-zinc-500">Voided — refunds open</p>;
    }
    if (isPast(closes)) {
        return <p className="mt-1 text-[12.5px] font-semibold text-sunset">Awaiting result</p>;
    }
    const soon = differenceInHours(closes, new Date()) < 24;
    return (
        <p className="mt-1 flex items-center gap-1.5 text-[12.5px] font-semibold text-zinc-500">
            {soon && <span className="size-1.5 rounded-full bg-pastelred" />}
            {soon ? <span className="text-pastelred">Closes today</span> : "Closes"}{" "}
            {format(closes, "MMM d @ h:mmaa")}
        </p>
    );
}

/**
 * One outcome row, Kalshi anatomy: label over a probability underline;
 * payout multiple + percentage pill on the right.
 */
function OutcomeRow({
    label,
    prob,
    multiple,
    rank,
    won,
    lost,
}: {
    label: string;
    prob: number;
    multiple: number | null;
    rank: number;
    won?: boolean;
    lost?: boolean;
}) {
    const barColor = won ? "bg-lantern" : lost ? "bg-white/15" : rank === 0 ? "bg-lantern" : "bg-twitter2";
    return (
        <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
                <p className={cn("truncate text-[14px] font-bold", won ? "text-lantern" : lost ? "text-zinc-500" : "text-zinc-100")}>
                    {label}
                    {won && <HugeiconsIcon icon={Tick02Icon} className="ml-1 inline size-3.5" strokeWidth={3} />}
                </p>
                <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.06]">
                    <div className={cn("h-full rounded-full", barColor)} style={{ width: `${Math.max(3, prob * 100)}%` }} />
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-2.5">
                {multiple !== null && !won && !lost && (
                    <span className="text-[13px] font-semibold tabular-nums text-zinc-500">{fmtMultiple(multiple)}</span>
                )}
                <span
                    className={cn(
                        "rounded-full px-3 py-1 text-[13px] font-bold tabular-nums ring-1",
                        won
                            ? "bg-lantern text-black ring-lantern"
                            : lost
                                ? "text-zinc-600 ring-white/10"
                                : rank === 0
                                    ? "text-lantern ring-lantern/40"
                                    : "text-zinc-200 ring-white/15",
                    )}
                >
                    {Math.round(prob * 100)}%
                </span>
            </div>
        </div>
    );
}

function MarketCard({ market, onOpen }: { market: MarketListItem; onOpen: () => void }) {
    const probs = odds(market.outcomes);
    const mults = multiples(market.outcomes, market.feeBps);
    const total = market.outcomes.reduce((s, o) => s + BigInt(o.poolUsdc), BigInt(0));
    const accent = categoryAccent(market.category);

    // Top two by probability (stable on ties), Kalshi-style.
    const order = market.outcomes
        .map((_, i) => i)
        .sort((a, b) => probs[b] - probs[a])
        .slice(0, 2);
    const resolved = market.status === "resolved";

    return (
        <button
            onClick={onOpen}
            className="flex cursor-pointer flex-col rounded-3xl bg-white/[0.03] p-5 text-left ring-1 ring-white/10 transition-colors hover:bg-white/[0.05] hover:ring-white/15"
        >
            {/* Eyebrow: category */}
            <div className="flex items-center gap-2">
                <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg bg-white/[0.06]", accent)}>
                    <HugeiconsIcon icon={categoryIcon(market.category)} className="size-4" strokeWidth={2} />
                </span>
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">{market.category}</span>
            </div>

            {/* Title + close line */}
            <p className="mt-3 line-clamp-2 text-[16px] font-bold leading-snug text-white">{market.question}</p>
            <CloseLine market={market} />

            {/* Top outcomes */}
            <div className="mt-4 flex-1 space-y-3.5">
                {order.map((i, rank) => (
                    <OutcomeRow
                        key={market.outcomes[i].idx}
                        label={market.outcomes[i].label}
                        prob={probs[i]}
                        multiple={mults[i]}
                        rank={rank}
                        won={resolved && market.winningOutcome === market.outcomes[i].idx}
                        lost={resolved && market.winningOutcome !== market.outcomes[i].idx}
                    />
                ))}
            </div>

            {/* Footer */}
            <div className="mt-4 flex items-center justify-between text-[12px] font-semibold">
                <span className="text-zinc-500">{usd(total)} pool</span>
                <span className="text-zinc-600">
                    {market.outcomes.length > 2 ? `${market.outcomes.length} outcomes` : `${market.outcomes.length} outcomes`}
                </span>
            </div>
        </button>
    );
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
    const mults = multiples(outcomes, m.feeBps);
    const bettable = m.status === "open" && !isPast(new Date(m.closesAt));
    const resolved = m.status === "resolved";
    const accent = categoryAccent(m.category);

    // Estimated payout for the composed bet: your stake joins the pool, so
    // quote the post-bet multiple, not the displayed pre-bet one.
    const stake = Number(amount) || 0;
    const estPayout = useMemo(() => {
        if (picked == null || stake < 1) return null;
        const pools = outcomes.map((o) => Number(BigInt(o.poolUsdc)) / 1_000_000);
        const total = pools.reduce((s, p) => s + p, 0);
        const mine = pools[outcomes.findIndex((o) => o.idx === picked)] + stake;
        const losing = total + stake - mine;
        return stake * ((mine + losing * (1 - m.feeBps / 10_000)) / mine);
    }, [picked, stake, outcomes, m.feeBps]);

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
            <DialogContent className="max-h-[85vh] gap-0 overflow-y-auto rounded-4xl border-none p-6 sm:max-w-[560px]" showCloseButton={false}>
                {/* Eyebrow + title + close line */}
                <div className="flex items-center gap-2">
                    <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg bg-white/[0.06]", accent)}>
                        <HugeiconsIcon icon={categoryIcon(m.category)} className="size-4" strokeWidth={2} />
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">{m.category}</span>
                </div>
                <DialogTitle className="mt-3 text-[19px] font-bold leading-snug tracking-tight text-white">
                    {m.question}
                </DialogTitle>
                <CloseLine market={m as MarketListItem} />
                {m.description && (
                    <p className="mt-3 text-[14px] font-medium leading-relaxed text-zinc-500">{m.description}</p>
                )}
                {"resolutionNote" in m && m.resolutionNote ? (
                    <p className="mt-3 rounded-2xl bg-white/[0.03] px-4 py-3 text-[13px] font-medium text-zinc-400 ring-1 ring-white/10">
                        {String(m.resolutionNote)}
                    </p>
                ) : null}

                {/* Outcomes */}
                <div className="mt-5 space-y-1.5">
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
                    <span className="flex items-center gap-1.5">
                        <HugeiconsIcon icon={Clock01Icon} className="size-3.5" strokeWidth={2} />
                        {usd(outcomes.reduce((s, o) => s + BigInt(o.poolUsdc), BigInt(0)))} pool
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
