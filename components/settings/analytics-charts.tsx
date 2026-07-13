"use client";

import { trpc } from "@/lib/trpc/client";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { ChartUpIcon, CrownIcon, EyeIcon, FavouriteIcon, UserGroup02Icon } from "@hugeicons/core-free-icons";
import { useMemo } from "react";
import { Panel } from "@/components/settings/ui";

// Brand series colors (lantern / twitter2 / pastelred / white / sunset)
const SERIES = {
    followers: "#00ED89",
    views: "#358efc",
    likes: "#FF746C",
    posts: "#e4e4e7",
    subs: "#FFCC00",
};

function SparkBar({ values, color }: { values: number[]; color: string }) {
    const max = Math.max(...values, 1);
    const w = 100 / values.length;

    return (
        <div className="space-y-2">
            <svg viewBox={`0 0 100 40`} className="h-14 w-full" preserveAspectRatio="none">
                {values.map((v, i) => {
                    const h = (v / max) * 36;
                    return (
                        <rect
                            key={i}
                            x={i * w + w * 0.1}
                            y={40 - h - 2}
                            width={w * 0.8}
                            height={Math.max(h, 1)}
                            rx="1"
                            fill={color}
                            opacity={v === 0 ? 0.15 : 0.8}
                        />
                    );
                })}
            </svg>
            <div className="flex justify-between text-[11px] font-medium text-zinc-600">
                <span>30d ago</span>
                <span>Today</span>
            </div>
        </div>
    );
}

function SparkLine({ values, color }: { values: number[]; color: string }) {
    const max = Math.max(...values, 1);
    const points = values.map((v, i) => {
        const x = (i / (values.length - 1)) * 100;
        const y = 40 - (v / max) * 36;
        return `${x},${y}`;
    }).join(" ");

    const area = `0,40 ${points} 100,40`;

    return (
        <svg viewBox="0 0 100 42" className="h-14 w-full" preserveAspectRatio="none">
            <defs>
                <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <polygon points={area} fill={`url(#grad-${color.replace("#", "")})`} />
            <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
    );
}

// Build a 30-day array from sparse day→value map
function buildDayArray(data: { day: string; count?: number; views?: number; likes?: number }[], key: "count" | "views" | "likes" = "count") {
    const map: Record<string, number> = {};
    for (const d of data) {
        map[d.day] = Number(d[key] ?? 0);
    }
    const arr: number[] = [];
    for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key2 = d.toISOString().slice(0, 10);
        arr.push(map[key2] ?? 0);
    }
    return arr;
}

function ChartTile({ icon, label, value, children, wide }: { icon: IconSvgElement; label: string; value: string; children: React.ReactNode; wide?: boolean }) {
    return (
        <Panel className={wide ? "col-span-2 space-y-1 p-4" : "space-y-1 p-4"}>
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-zinc-500">
                <HugeiconsIcon icon={icon} className="size-3.5" strokeWidth={2} /> {label}
            </div>
            <p className="text-xl font-bold tabular-nums tracking-tight text-white">{value}</p>
            {children}
        </Panel>
    );
}

export function AnalyticsCharts() {
    const { data, isLoading } = trpc.user.getEngagementHistory.useQuery();

    const followerData = useMemo(() => buildDayArray(data?.followerGains ?? []), [data]);
    const viewsData = useMemo(() => buildDayArray(data?.postActivity ?? [], "views"), [data]);
    const likesData = useMemo(() => buildDayArray(data?.postActivity ?? [], "likes"), [data]);
    const postsData = useMemo(() => buildDayArray(data?.postActivity ?? [], "count"), [data]);
    const subscriberData = useMemo(() => buildDayArray(data?.subscriberGains ?? []), [data]);

    const totalNewFollowers = followerData.reduce((a, b) => a + b, 0);
    const totalViews = viewsData.reduce((a, b) => a + b, 0);
    const totalLikes = likesData.reduce((a, b) => a + b, 0);
    const totalNewSubs = subscriberData.reduce((a, b) => a + b, 0);

    if (isLoading) return (
        <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-28 overflow-hidden rounded-[20px]"><div className="size-full shimmer-skeleton" /></div>
            ))}
        </div>
    );

    return (
        <div className="space-y-4">
            <p className="text-[14px] font-semibold text-zinc-500">Last 30 days</p>
            <div className="grid grid-cols-2 gap-3">
                <ChartTile icon={UserGroup02Icon} label="New followers" value={`+${totalNewFollowers.toLocaleString()}`}>
                    <SparkLine values={followerData} color={SERIES.followers} />
                </ChartTile>
                <ChartTile icon={EyeIcon} label="Post views" value={totalViews.toLocaleString()}>
                    <SparkLine values={viewsData} color={SERIES.views} />
                </ChartTile>
                <ChartTile icon={FavouriteIcon} label="Likes received" value={totalLikes.toLocaleString()}>
                    <SparkLine values={likesData} color={SERIES.likes} />
                </ChartTile>
                <ChartTile icon={ChartUpIcon} label="Posts published" value={postsData.reduce((a, b) => a + b, 0).toLocaleString()}>
                    <SparkBar values={postsData} color={SERIES.posts} />
                </ChartTile>
                <ChartTile icon={CrownIcon} label="New subscribers" value={`+${totalNewSubs.toLocaleString()}`} wide>
                    <SparkLine values={subscriberData} color={SERIES.subs} />
                </ChartTile>
            </div>
        </div>
    );
}
