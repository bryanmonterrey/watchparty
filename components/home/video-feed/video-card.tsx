import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { VerticalDotsIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { formatRelativeTime } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { VerifiedBadgeIcon, BusinessBadgeIcon, GovBadgeIcon } from "@/components/icons";
import { MarketCapChip } from "@/components/tokens/market-cap-chip";
import { Video } from "./types";

interface VideoCardProps {
    video?: Video;
    loading?: boolean;
}

function formatViews(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
}

export function VideoCard({ video, loading }: VideoCardProps) {
    const router = useRouter();

    if (loading || !video) {
        return (
            <div className="rounded-none md:rounded-3xl">
                <div className="aspect-video opacity-50 rounded-none md:rounded-2xl shimmer-skeleton" />
                <div className="p-3 flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full shimmer-skeleton shrink-0" />
                    <div className="flex flex-col gap-2 flex-1 min-w-0 pt-1">
                        <div className="h-3.5 w-3/4 rounded-full shimmer-skeleton" />
                        <div className="h-3 w-1/3 rounded-full shimmer-skeleton" />
                        <div className="h-3 w-1/2 opacity-50 rounded-full shimmer-skeleton" />
                    </div>
                </div>
            </div>
        );
    }

    const videoUrl = `/${video.user.username ?? video.user.name}/${video.id}`;
    const profileUrl = `/${video.user.username ?? video.user.name}`;

    return (
        <motion.div
            initial="initial"
            animate="animate"
            whileHover="hover"
            variants={{
                initial: { opacity: 0 },
                animate: { opacity: 1 },
                hover: {}
            }}
            transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            onClick={() => router.push(videoUrl)}
            className="group relative rounded-none md:rounded-3xl cursor-pointer isolate z-0"
        >
            <div className="absolute inset-0 bg-black rounded-none md:rounded-3xl -z-20" />
            <motion.div
                variants={{
                    initial: { scale: 0.5, opacity: 0, backgroundColor: "rgba(74,74,74,0)" },
                    hover: { scale: 1, opacity: 1, backgroundColor: "rgba(74, 74, 74, 0.3)" }
                }}
                transition={{ type: "spring", stiffness: 500, damping: 30, mass: 0.5 }}
                className="absolute inset-[-12px] -z-10 rounded-none md:rounded-[35px] pointer-events-none"
            />

            {/* Thumbnail */}
            <div className="relative aspect-video border border-flexborder/1 rounded-none md:rounded-2xl bg-zinc-800/25 overflow-hidden">
                {video.thumbnailUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={video.thumbnailUrl} alt={video.title} className="w-full h-full object-cover" />
                )}
                <MarketCapChip
                    tokenSlug={video.tokenAddress ?? video.tokenId}
                    marketCap={video.marketCapUsd}
                    ticker={video.ticker}
                    className="absolute left-2 top-2 z-10"
                />
            </div>

            {/* Info */}
            <div className="grid grid-cols-[40px_1fr_auto] gap-3 p-3 items-start">
                {/* Col 1: Avatar */}
                <Avatar
                    className="h-10 w-10 shrink-0"
                    onClick={(e) => { e.stopPropagation(); router.push(profileUrl); }}
                >
                    <AvatarImage src={video.user.avatar_url ?? undefined} />
                    <AvatarFallback className="bg-zinc-700/10" />
                </Avatar>

                {/* Col 2: Title, username, views + time */}
                <div className="flex flex-col min-w-0">
                    <span className="text-md hover:underline cursor-pointer font-semibold text-white/90 line-clamp-2">{video.title}</span>
                    <div className="flex items-center gap-1.5">
                        <span
                            className="text-sm font-medium text-zinc-400 truncate hover:underline w-fit"
                            onClick={(e) => { e.stopPropagation(); router.push(profileUrl); }}
                        >
                            {video.user.username ?? video.user.name}
                        </span>
                        {video.user.verifiedTier === "verified" && <VerifiedBadgeIcon className="w-3.5 h-3.5 shrink-0" />}
                        {video.user.verifiedTier === "business" && <BusinessBadgeIcon className="w-3.5 h-3.5 shrink-0" />}
                        {video.user.verifiedTier === "government" && <GovBadgeIcon className="w-3.5 h-3.5 shrink-0" />}
                        {video.ticker && (
                            <span
                                onClick={(e) => e.stopPropagation()}
                                className={cn(
                                    "text-xs font-black tracking-tighter px-1.5 py-0.5 rounded-full shrink-0",
                                    video.tokenStatus === "live"
                                        ? "bg-emerald-500/20 text-emerald-500"
                                        : "bg-zinc-700/40 text-zinc-400"
                                )}
                            >
                                ${video.ticker}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center space-x-1">
                        <span className="text-sm font-medium text-zinc-500">{formatViews(video.views)} views</span>
                        <span className="text-zinc-700">•</span>
                        <span className="text-sm font-medium text-zinc-500">{formatRelativeTime(video.createdAt.toISOString())}</span>
                    </div>
                </div>

                {/* Col 3: More button */}
                <div>
                    <Button
                        className="h-8 w-8 rounded-full hover:bg-white/20 bg-transparent text-zinc-400 hover:text-white p-1 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <VerticalDotsIcon className="size-5" />
                    </Button>
                </div>
            </div>
        </motion.div>
    );
}
