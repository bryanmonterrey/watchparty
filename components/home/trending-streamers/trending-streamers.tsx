"use client"

import {
    Carousel,
    CarouselContent,
    CarouselItem,
} from "@/components/ui/carousel";
import { staggerPulse } from "@/lib/skeleton-stagger";

const STREAMER_COUNT = 10;

export function TrendingStreamers() {
    return (
        <div className="w-full min-w-0 pb-4 space-y-2">
            <div className="relative group w-full">
                <Carousel
                    opts={{ align: "start", dragFree: true, containScroll: "trimSnaps" }}
                    className="w-full"
                >
                    <CarouselContent className="-ml-2 pl-4">
                        {Array.from({ length: STREAMER_COUNT }).map((_, i) => (
                            <CarouselItem key={i} className="pl-2 basis-auto">
                                <div
                                    className="flex items-center gap-3 bg-zinc-800/25 rounded-2xl p-2 pr-4 min-w-[160px]"
                                    style={staggerPulse(i, STREAMER_COUNT)}
                                >
                                    <div className="h-10 w-10 rounded-full bg-zinc-700/40 shrink-0" />
                                    <div className="flex flex-col gap-2">
                                        <div className="h-2.5 w-16 rounded-full bg-zinc-700/40" />
                                        <div className="h-4 w-14 rounded-md bg-zinc-700/40" />
                                    </div>
                                </div>
                            </CarouselItem>
                        ))}
                    </CarouselContent>
                </Carousel>
            </div>
        </div>
    );
}
