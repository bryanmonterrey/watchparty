"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { UserResultCard } from "./user-result-card";
import { PostCardAvatar } from "./post-card/post-card-avatar";

// Discover right rail — real data. Cards self-hide when empty so the rail is
// never a wall of placeholders on a young platform:
//   • Relevant people — post-detail pages only (author + mentioned + repliers)
//   • Live on watchparty — currently-live streams
//   • Who to follow — suggested accounts
//   • What's happening — GLM coin news (falls back to plain coin movers)

function RailCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="overflow-hidden rounded-[25px] border border-soft-gray/[0.12]">
            <h2 className="px-6 pb-2 pt-5 text-[24px] font-extrabold tracking-tight">{title}</h2>
            <div className="hidden-scrollbar pb-4">{children}</div>
        </section>
    );
}

// ── Relevant people (post detail only) ──────────────────────────────────────
function RelevantPeopleCard() {
    const pathname = usePathname();
    const postId = pathname?.match(/^\/discover\/post\/([^/]+)/)?.[1];

    const { data } = trpc.content.relevantPeople.useQuery(
        { postId: postId ?? "" },
        { enabled: !!postId, staleTime: 60_000 },
    );

    if (!postId || !data || data.length === 0) return null;

    return (
        <RailCard title="Relevant people">
            {data.map((person) => (
                <UserResultCard key={person.id} user={person} initialIsFollowing={person.isFollowing} />
            ))}
        </RailCard>
    );
}

// ── Runners (trending coins) ────────────────────────────────────────────────
type Runner = {
    id: string;
    tokenAddress: string | null;
    ticker: string | null;
    name: string | null;
    imageUrl: string | null;
    priceUsd: number | null;
    priceChange24h: number | null;
    marketCapUsd: number | null;
    volume24hUsd: number | null;
};

function formatUsd(n: number) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
    return `$${n.toFixed(0)}`;
}

function RunnerRow({ runner, rank }: { runner: Runner; rank: number }) {
    const change = runner.priceChange24h ?? 0;
    return (
        <Link
            href={`/${runner.tokenAddress ?? runner.id}`}
            className="flex w-full items-center gap-3 px-6 py-2.5 text-left transition-colors hover:bg-foreground/[0.03]"
        >
            <span className="w-4 shrink-0 text-[15px] font-bold text-muted-foreground tabular-nums">{rank}</span>
            {runner.imageUrl ? (
                <img src={runner.imageUrl} alt="" className="size-9 shrink-0 rounded-full object-cover" />
            ) : (
                <span className="size-9 shrink-0 rounded-full bg-muted" />
            )}
            <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[15px]">
                    <span className="truncate font-extrabold">${runner.ticker || "COIN"}</span>
                    {runner.marketCapUsd ? (
                        <span className="shrink-0 text-[13px] text-muted-foreground">{formatUsd(runner.marketCapUsd)}</span>
                    ) : null}
                </p>
                {runner.name && <p className="truncate text-[13px] text-muted-foreground">{runner.name}</p>}
            </div>
            <span className="shrink-0 text-[15px] font-bold tabular-nums text-green-500">
                +{change.toFixed(change >= 100 ? 0 : 1)}%
            </span>
        </Link>
    );
}

function RunnersCard() {
    const { data } = trpc.trade.runners.useQuery({ limit: 5 }, { staleTime: 60_000, refetchInterval: 60_000 });
    if (!data || data.length === 0) return null;
    return (
        <RailCard title="Runners">
            {data.map((runner, i) => (
                <RunnerRow key={runner.id} runner={runner} rank={i + 1} />
            ))}
        </RailCard>
    );
}

// ── Live on watchparty ──────────────────────────────────────────────────────
type LiveStream = {
    userId: string;
    title: string | null;
    category: string | null;
    viewerCount: number;
    name: string | null;
    username: string | null;
    avatar_url: string | null;
    verifiedTier: string | null;
};

function formatCount(n: number) {
    if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K`;
    return `${n}`;
}

function LiveRow({ stream }: { stream: LiveStream }) {
    const person = { id: stream.userId, name: stream.name, username: stream.username, avatar_url: stream.avatar_url, verifiedTier: stream.verifiedTier };
    return (
        <Link
            href={`/${stream.username ?? ""}`}
            className="flex w-full items-start gap-3 px-6 py-2.5 text-left transition-colors hover:bg-foreground/[0.03]"
        >
            <div className="mt-0.5 shrink-0">
                <PostCardAvatar user={person} />
            </div>
            <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 text-[15px]">
                    <span className="truncate font-extrabold">{stream.name || stream.username || "Streamer"}</span>
                    <span className="shrink-0 font-medium text-muted-foreground">is live</span>
                </p>
                <p className="mt-0.5 line-clamp-2 text-[16px] font-extrabold leading-snug">
                    {stream.title || "Live now"}
                </p>
                {stream.category && <p className="mt-0.5 text-[14px] text-muted-foreground">{stream.category}</p>}
            </div>
            <span className="mt-1 flex shrink-0 items-center gap-1.5 rounded-full border border-red1 px-2 py-0.5 text-[13px] font-bold text-red1">
                <span className="size-1.5 animate-pulse rounded-full bg-red1" />
                {formatCount(stream.viewerCount)}
            </span>
        </Link>
    );
}

function LiveCard() {
    const { data } = trpc.stream.listLive.useQuery({ limit: 4 }, { staleTime: 30_000, refetchInterval: 60_000 });
    if (!data || data.length === 0) return null;
    return (
        <RailCard title="Live on watchparty">
            {data.map((s) => (
                <LiveRow key={s.userId} stream={s} />
            ))}
        </RailCard>
    );
}

// ── Who to follow ───────────────────────────────────────────────────────────
function WhoToFollowCard() {
    const { data } = trpc.user.suggestedFollows.useQuery({ limit: 3 }, { staleTime: 120_000 });
    if (!data || data.length === 0) return null;
    return (
        <RailCard title="Who to follow">
            {data.map((person) => (
                <UserResultCard key={person.id} user={person} initialIsFollowing={person.isFollowing} />
            ))}
        </RailCard>
    );
}

// ── What's happening (GLM coin news) ────────────────────────────────────────
function TrendRow({ title, meta, ticker, tokenAddress }: { title: string; meta: string; ticker?: string; tokenAddress?: string | null }) {
    // Deep-link to the coin when we know it, else search for the ticker.
    const href = tokenAddress ? `/${tokenAddress}` : ticker ? `/discover/search?q=${encodeURIComponent("$" + ticker)}` : "/trade";
    return (
        <Link href={href} className="block w-full px-6 py-2.5 text-left transition-colors hover:bg-foreground/[0.03]">
            <p className="text-[14px] text-muted-foreground">{meta}</p>
            <p className="line-clamp-2 text-[16px] font-bold leading-snug">{title}</p>
        </Link>
    );
}

function NewsCard() {
    const { data } = trpc.discover.trending.useQuery({ limit: 5 }, { staleTime: 300_000 });
    if (!data || data.items.length === 0) return null;
    return (
        <RailCard title="What's happening">
            {data.items.map((item, i) => (
                <TrendRow key={i} {...item} />
            ))}
        </RailCard>
    );
}

export function DiscoverRightRail() {
    return (
        <div className="flex w-[368px] max-w-full flex-col gap-[18px] pb-8">
            <RelevantPeopleCard />
            <RunnersCard />
            <LiveCard />
            <WhoToFollowCard />
            <NewsCard />
            <div className="h-[50svh] w-full shrink-0 bg-transparent" />
        </div>
    );
}
