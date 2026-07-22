"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
    ArrowDown01Icon,
    FireIcon,
    PlusSignIcon,
    Target02Icon,
    Tick02Icon,
} from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { GooDropdown } from "@/components/ui/goo-dropdown";
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

// Predictions — in-house pari-mutuel markets in USDC. Bets pay the treasury
// (verified on-chain like boost packs); winners split the losing pool minus
// the fee and claim from the payout float. 100% watchparty rails.
//
// Layout borrows Kalshi's market-browser anatomy (top category tabs, sort
// control, outcome rows with probability underlines + payout multiples +
// percentage pills) expressed in watchparty's identity. Cards navigate to
// each market's own page (/trade/predictions/[id]) — betting lives there.

type SortKey = "trending" | "closing" | "newest";
const SORT_LABEL: Record<SortKey, string> = { trending: "Trending", closing: "Closing soon", newest: "Newest" };

export function PredictionsView() {
    const { data: session } = useAuthSession();
    const isAdmin = session?.user?.role === "admin";
    const [category, setCategory] = useState<string | null>(null);
    const [sort, setSort] = useState<SortKey>("trending");
    const [creating, setCreating] = useState(false);
    const router = useRouter();

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
                    <div className="-mx-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
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
                            <MarketCard
                                key={m.id}
                                market={m as MarketListItem}
                                onOpen={() => router.push(`/trade/predictions/${m.id}`)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {creating && <CreateMarketDialog onClose={() => setCreating(false)} />}
        </ScrollArea>
    );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "relative z-10 flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[15px] font-bold transition-all",
                active ? "text-white/80" : "text-zinc-500 hover:bg-zinc-900/65 hover:text-white",
            )}
        >
            {children}
            {active && (
                <motion.div
                    layoutId="predictionsTabHighlight"
                    className="absolute inset-0 -z-10 rounded-full bg-gray1"
                    initial={false}
                    transition={{ type: "spring", stiffness: 250, damping: 30 }}
                />
            )}
        </button>
    );
}

function MarketCard({ market, onOpen }: { market: MarketListItem; onOpen: () => void }) {
    const probs = odds(market.outcomes);
    const mults = multiples(market.outcomes, market.feeBps);
    const total = market.outcomes.reduce((s, o) => s + BigInt(o.poolUsdc), BigInt(0));

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
            <CategoryEyebrow category={market.category} />

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
                <span className="text-zinc-600">{market.outcomes.length} outcomes</span>
            </div>
        </button>
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
