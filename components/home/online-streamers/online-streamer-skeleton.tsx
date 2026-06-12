import { Skeleton } from "@/components/ui/skeleton";
import { Marquee } from "@/components/ui/marquee";

export function OnlineStreamerSkeleton() {
    return (
        <div className="w-full min-w-0 relative overflow-hidden shrink-0 invisible md:visible">
            {/* Left Gradient & Header */}
            <div className="absolute left-0 top-0 z-10 h-full flex items-center justify-center bg-gradient-to-r from-black via-black via-black/75 to-transparent pr-16 pl-4">
                <div className="flex items-center gap-2 pl-1" />
            </div>

            {/* Right Gradient */}
            <div className="absolute right-0 top-0 h-full z-10 w-100 bg-gradient-to-l from-[#0A0B0D] to-transparent pointer-events-none" />

            <div className="w-full">
                <Marquee className="[--duration:80s] [--gap:10px] p-1">
                    {Array.from({ length: 15 }).map((_, i) => (
                        <div
                            key={i}
                            className="flex items-center gap-3 border-2 border-[#17171B] bg-gray1/35 rounded-2xl p-1.5 pr-4 min-w-[140px] bg-[#0A0B0D] bg-dot-pattern"
                        >
                            <Skeleton className="h-9 w-9 rounded-full bg-white/5 shrink-0" />
                            <div className="flex flex-col gap-1.5">
                                <Skeleton className="h-3 w-16 rounded-full bg-white/10" />
                                <div className="flex items-center gap-1">
                                    <div className="w-1 h-1 rounded-full bg-white/5" />
                                    <Skeleton className="h-2 w-8 rounded-full bg-white/5" />
                                </div>
                            </div>
                        </div>
                    ))}
                </Marquee>
            </div>
        </div>
    );
}
