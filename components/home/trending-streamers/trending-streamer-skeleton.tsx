import { Skeleton } from "@/components/ui/skeleton";
import {
    Carousel,
    CarouselContent,
    CarouselItem,
} from "@/components/ui/carousel";

export function TrendingStreamerSkeleton() {
    return (
        <div className="w-full min-w-0 pb-4 space-y-2">
            <div className="ml-3">
                <Skeleton className="h-6 w-40 bg-zinc-800/50" />
            </div>

            <div className="relative group w-full">
                <Carousel
                    opts={{
                        align: "start",
                        dragFree: true,
                        containScroll: "trimSnaps",
                    }}
                    className="w-full"
                >
                    <CarouselContent className="-ml-2 pl-4">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <CarouselItem key={i} className="pl-2 basis-auto">
                                <div
                                    className="flex items-center gap-3 bg-[#17171B]/35 bg-dot-pattern border-2 border-[#17171B] rounded-2xl p-2 pr-4 min-w-[160px]"
                                >
                                    <Skeleton className="h-10 w-10 rounded-full bg-white/5 shrink-0" />
                                    <div className="flex flex-col gap-2">
                                        <Skeleton className="h-3 w-20 rounded-full bg-white/10" />
                                        <Skeleton className="h-4 w-12 rounded-md bg-white/5" />
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
