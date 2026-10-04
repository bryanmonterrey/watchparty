"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDownRight01Icon, ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import type { inferRouterOutputs } from "@trpc/server";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { staggerPulse } from "@/lib/skeleton-stagger";
import { stableHoverColor } from "@/lib/stable-hover-color";
import { CoinImage } from "@/components/coins/coin-image";
import { DataTable, createDataTableColumnHelper } from "@/components/ui/data-table";
import { useElementWidth } from "@/hooks/use-element-width";
import { changeTone, compactUsd, percentAbs, tokenPrice } from "@/components/trending/trending-format";
import type { AppRouter } from "@/server/routers";

// The profile's Coins tab: every coin this person has created, as a table on
// the same DataTable the trending board runs (owner, 2026-10-04: "the coins
// should be on like a table", "easier to see the coins"). Live coins first
// with their numbers; drafts after them with a Launch pill instead of a
// price, because a draft's page is where the first buy — the launch — lives.

type CoinRow = inferRouterOutputs<AppRouter>["trade"]["listByCreator"][number];

const CELL_TEXT = "text-15 font-medium leading-tight";
const helper = createDataTableColumnHelper<CoinRow>();
const bar = (i: number, count: number, cls: string) => (
    <span style={staggerPulse(i, count)} className={cn("block rounded-full shimmer-skeleton", cls)} />
);

/** Live coins link by mint; drafts only have their row id. /coin/<slug> resolves both. */
const coinHref = (r: CoinRow) => `/coin/${r.tokenAddress ?? r.id}`;

function NameCell({ row }: { row: CoinRow }) {
    const draft = row.status !== "live";
    return (
        <span className="flex min-w-0 items-center gap-3">
            <CoinImage src={row.imageUrl} className="size-9 shrink-0 rounded-full" />
            <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex min-w-0 items-center gap-1.5">
                    <span className={cn(CELL_TEXT, "truncate font-semibold text-white")}>${row.ticker}</span>
                    {row.isCreatorCoin && (
                        <span className="shrink-0 rounded-full bg-twitter2/15 px-1.5 py-0.5 text-11 font-bold leading-none text-twitter2">
                            creator
                        </span>
                    )}
                    {draft && (
                        <span className="shrink-0 rounded-full bg-white/[0.06] px-1.5 py-0.5 text-11 font-bold leading-none text-zinc-400">
                            draft
                        </span>
                    )}
                </span>
                <span className="truncate text-13 font-medium text-zinc-500">{row.name}</span>
            </span>
        </span>
    );
}

function ChangeCell({ pct }: { pct: number | null }) {
    const known = pct != null && Number.isFinite(pct) && pct !== 0;
    return (
        <span className={cn("flex items-center gap-1 tabular-nums", CELL_TEXT, changeTone(pct))}>
            {known && (
                <HugeiconsIcon icon={pct > 0 ? ArrowUpRight01Icon : ArrowDownRight01Icon} className="size-4 shrink-0" strokeWidth={2} />
            )}
            {percentAbs(pct)}
        </span>
    );
}

export function ProfileCoinsTable({ userId, isOwner }: { userId: string; isOwner: boolean }) {
    const router = useRouter();
    const { data, isLoading, isError } = trpc.trade.listByCreator.useQuery({ creatorId: userId }, { staleTime: 60_000 });
    const [boardRef, boardWidth] = useElementWidth<HTMLDivElement>();
    // Mcap and holders come in as the column widens — same idea as the board:
    // phones get name / price / change, nothing squeezed.
    const wide = boardWidth >= 560;
    const columnVisibility = useMemo(() => ({ marketCap: wide, holders: wide }), [wide]);

    const columns = useMemo(
        () => [
            helper.display({
                id: "coin",
                header: "Name",
                enableSorting: false,
                cell: ({ row }) => <NameCell row={row.original} />,
                meta: {
                    skeleton: (i, count) => (
                        <span className="flex min-w-0 items-center gap-3">
                            <span style={staggerPulse(i, count)} className="size-9 shrink-0 rounded-full shimmer-skeleton" />
                            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                                {bar(i, count, "h-3.5 w-24")}
                                {bar(i, count, "h-3 w-16")}
                            </span>
                        </span>
                    ),
                },
            }),
            helper.accessor((r) => r.priceUsd ?? 0, {
                id: "price",
                header: "Price",
                enableSorting: false,
                meta: { width: "96px", skeleton: (i, c) => bar(i, c, "h-3 w-14") },
                cell: ({ row }) =>
                    row.original.status === "live" ? (
                        <span className={cn(CELL_TEXT, "tabular-nums text-white")}>{tokenPrice(row.original.priceUsd)}</span>
                    ) : (
                        <span className={cn(CELL_TEXT, "text-zinc-600")}>—</span>
                    ),
            }),
            helper.accessor((r) => r.marketCapUsd ?? 0, {
                id: "marketCap",
                header: "Mcap",
                enableSorting: false,
                meta: { width: "96px", skeleton: (i, c) => bar(i, c, "h-3 w-14") },
                cell: ({ row }) => (
                    <span className={cn(CELL_TEXT, "tabular-nums", row.original.status === "live" ? "text-white" : "text-zinc-600")}>
                        {row.original.status === "live" ? compactUsd(row.original.marketCapUsd) : "—"}
                    </span>
                ),
            }),
            helper.accessor((r) => r.holderCount ?? 0, {
                id: "holders",
                header: "Holders",
                enableSorting: false,
                meta: { width: "92px", skeleton: (i, c) => bar(i, c, "h-3 w-10") },
                cell: ({ row }) => (
                    <span className={cn(CELL_TEXT, "tabular-nums", row.original.status === "live" ? "text-white" : "text-zinc-600")}>
                        {row.original.status === "live" ? (row.original.holderCount ?? 0).toLocaleString() : "—"}
                    </span>
                ),
            }),
            helper.accessor((r) => r.priceChange24h ?? 0, {
                id: "change",
                header: "24h",
                enableSorting: false,
                meta: { width: "92px", skeleton: (i, c) => bar(i, c, "h-3 w-12") },
                cell: ({ row }) =>
                    row.original.status === "live" ? (
                        <ChangeCell pct={row.original.priceChange24h} />
                    ) : (
                        // The one action a draft has. A pill, not a button that
                        // launches from here: the first buy takes an amount.
                        <span className="inline-flex h-7 items-center rounded-full bg-lantern/10 px-3 text-12 font-bold text-lantern">
                            {isOwner ? "Launch" : "First buy"}
                        </span>
                    ),
            }),
        ],
        [isOwner],
    );

    if (isError) return <p className={cn(CELL_TEXT, "py-16 text-center text-zinc-500")}>couldn&apos;t load the coins.</p>;

    return (
        <div ref={boardRef} className="px-1">
            <DataTable
                data={data ?? []}
                columns={columns}
                getRowId={(r) => r.id}
                columnVisibility={columnVisibility}
                rowHeight={64}
                loading={isLoading}
                skeletonRows={6}
                rowHoverRadius={12}
                rowHoverColor={(r) => stableHoverColor(r.id)}
                onRowClick={(r) => router.push(coinHref(r))}
                headerClassName={cn("text-zinc-500", CELL_TEXT)}
                emptyState={
                    <p className={cn(CELL_TEXT, "py-16 text-center text-zinc-500")}>
                        {isOwner ? "You haven't created a coin yet." : "No coins yet."}
                    </p>
                }
            />
        </div>
    );
}
