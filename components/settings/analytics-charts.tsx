"use client";

import { trpc } from "@/lib/trpc/client";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Users, Eye, Heart, Crown } from "lucide-react";
import { useMemo } from "react";

function SparkBar({ values, color, label }: { values: number[]; color: string; label: string }) {
    const max = Math.max(...values, 1);
    const w = 100 / values.length;

    return (
        <div className="space-y-2">
            <p className="text-xs font-semibold text-zinc-400">{label}</p>
            <svg viewBox={`0 0 100 40`} className="w-full h-14" preserveAspectRatio="none">
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
            <div className="flex justify-between text-[10px] text-zinc-600">
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
        <svg viewBox="0 0 100 42" className="w-full h-14" preserveAspectRatio="none">
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
            {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
    );

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-lantern" />
                <p className="text-sm font-semibold text-zinc-300">Last 30 Days</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-zinc-900/60 border border-white/10 p-4 space-y-1">
                    <div className="flex items-center gap-1.5 text-zinc-500 text-xs">
                        <Users className="w-3.5 h-3.5" /> New Followers
                    </div>
                    <p className="text-xl font-bold text-zinc-100">+{totalNewFollowers.toLocaleString()}</p>
                    <SparkLine values={followerData} color="#00ED89" />
                </div>
                <div className="rounded-xl bg-zinc-900/60 border border-white/10 p-4 space-y-1">
                    <div className="flex items-center gap-1.5 text-zinc-500 text-xs">
                        <Eye className="w-3.5 h-3.5" /> Post Views
                    </div>
                    <p className="text-xl font-bold text-zinc-100">{totalViews.toLocaleString()}</p>
                    <SparkLine values={viewsData} color="#60a5fa" />
                </div>
                <div className="rounded-xl bg-zinc-900/60 border border-white/10 p-4 space-y-1">
                    <div className="flex items-center gap-1.5 text-zinc-500 text-xs">
                        <Heart className="w-3.5 h-3.5" /> Likes Received
                    </div>
                    <p className="text-xl font-bold text-zinc-100">{totalLikes.toLocaleString()}</p>
                    <SparkLine values={likesData} color="#f472b6" />
                </div>
                <div className="rounded-xl bg-zinc-900/60 border border-white/10 p-4 space-y-1">
                    <div className="flex items-center gap-1.5 text-zinc-500 text-xs">
                        <TrendingUp className="w-3.5 h-3.5" /> Posts Published
                    </div>
                    <p className="text-xl font-bold text-zinc-100">{postsData.reduce((a,b)=>a+b,0)}</p>
                    <SparkBar values={postsData} color="#a78bfa" label="" />
                </div>
                <div className="rounded-xl bg-zinc-900/60 border border-white/10 p-4 space-y-1 col-span-2">
                    <div className="flex items-center gap-1.5 text-zinc-500 text-xs">
                        <Crown className="w-3.5 h-3.5" /> New Subscribers
                    </div>
                    <p className="text-xl font-bold text-zinc-100">+{totalNewSubs.toLocaleString()}</p>
                    <SparkLine values={subscriberData} color="#f59e0b" />
                </div>
            </div>
        </div>
    );
}
