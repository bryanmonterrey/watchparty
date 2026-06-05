import { Skeleton } from "@/components/ui/skeleton";
import { DivideSquare } from "lucide-react";

export function VideoSkeleton() {
    return (
        <div className="group relative rounded-none md:rounded-3xl overflow-hidden">
            {/* Thumbnail Skeleton */}
            <div className="relative aspect-video rounded-none md:rounded-3xl">
                <div className="shimmer-skeleton absolute inset-0 h-full w-full opacity-50 rounded-none md:rounded-3xl" />
            </div>

            {/* Content Skeleton */}
            <div className="relative inset-x-0 bottom-0 p-3">
                <div className="flex items-center gap-3">
                    <div className="shimmer-skeleton h-10 w-10 rounded-full shrink-0" />
                    <div className="flex flex-col gap-2 w-full">
                        <div className="shimmer-skeleton h-4 w-3/4 rounded-full" />
                        <div className="shimmer-skeleton h-3 w-1/2 rounded-full opacity-50" />
                    </div>
                </div>
            </div>
        </div>
    );
}
