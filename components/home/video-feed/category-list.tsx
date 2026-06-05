import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPrevious,
    type CarouselApi,
} from "@/components/ui/carousel";
import { CATEGORIES } from "./types";

interface CategoryListProps {
    activeTab: string;
    setActiveTab: (tab: string) => void;
    /** Override the category set (defaults to the home feed categories). */
    categories?: string[];
}

export function CategoryList({ activeTab, setActiveTab, categories = CATEGORIES }: CategoryListProps) {
    const [api, setApi] = useState<CarouselApi>();
    const [canScrollPrev, setCanScrollPrev] = useState(false);
    const [canScrollNext, setCanScrollNext] = useState(true);

    useEffect(() => {
        if (!api) return;

        const updateScrollState = () => {
            setCanScrollPrev(api.canScrollPrev());
            setCanScrollNext(api.canScrollNext());
        };

        updateScrollState();
        api.on("select", updateScrollState);
        api.on("reInit", updateScrollState);
    }, [api]);


return (
        <div className="relative group/categories">
            <Carousel
                    setApi={setApi}
                    opts={{
                        align: "start",
                        dragFree: true,
                        containScroll: "trimSnaps",
                    }}
                    className="w-full"
                >
                    <CarouselContent className="-ml-2 pl-4">
                        {categories.map((category) => (
                            <CarouselItem key={category} className="pl-2 basis-auto">
                                <button
                                    onClick={() => setActiveTab(category)}
                                    className={cn(
                                        "relative px-4 cursor-pointer backdrop-blur-lg transition-colors duration-200 ease-in-out py-2 text-sm font-semibold rounded-full transition-all flex items-center gap-1.5 z-10",
                                        activeTab === category
                                            ? "text-white z-20"
                                            : "text-zinc-400 bg-input1 hover:text-white hover:bg-zinc-500/35"
                                    )}
                                >
                                    {activeTab === category && (
                                        <motion.div
                                            layoutId="categoryActiveTab"
                                            className="absolute cursor-pointer inset-0 bg-zinc-500/60 text-white rounded-full -z-10"
                                            initial={false}
                                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                        />
                                    )}
                                    {category}
                                </button>
                            </CarouselItem>
                        ))}
                    </CarouselContent>
                    {canScrollPrev && (
                        <div className="absolute left-0 top-0 bottom-0 flex items-center bg-gradient-to-r from-[#0A0B0D] to-transparent w-12 z-20 pointer-events-none">
                            <div className="pointer-events-auto">
                                <CarouselPrevious className="h-8 w-8 static translate-y-0 hover:bg-zinc-800 border-zinc-800 bg-zinc-900 text-zinc-400" />
                            </div>
                        </div>
                    )}
                    {canScrollNext && (
                        <div className="absolute right-0 top-0 bottom-0 flex items-center justify-end bg-gradient-to-l from-[#0A0B0D] to-transparent w-12 z-20 pointer-events-none">
                            <div className="pointer-events-auto">
                                <CarouselNext className="h-8 w-8 static translate-y-0 hover:bg-zinc-800 border-zinc-800 bg-zinc-900 text-zinc-400" />
                            </div>
                        </div>
                    )}
                </Carousel>
        </div>
    );
}
