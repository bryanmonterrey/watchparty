"use client";

import { useParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Squircle } from "@/components/ui/squircle";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

type CommunityServerIconProps = {
    id: string;
    imageUrl: string | null;
    name: string;
    hasUnread?: boolean;
    mentionCount?: number;
};

export function CommunityServerIcon({ id, imageUrl, name, hasUnread = false, mentionCount = 0 }: CommunityServerIconProps) {
    const params = useParams();
    const router = useRouter();
    const isActive = params?.serverId === id;

    return (
        <TooltipProvider delayDuration={50}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        onClick={() => router.push(`/communities/${id}`)}
                        className="group cursor-pointer relative flex items-center justify-center w-full"
                    >
                        {/* Nested squircles: the outer one's background is the
                            "ring" (a real ring-* would be cut off by the
                            squircle clip-path), the inner one holds the image. */}
                        <Squircle asChild radius={18} autoEffects={false}>
                            <div
                                className={cn(
                                    "relative flex h-[62px] w-[62px] transition-colors items-center justify-center",
                                    "bg-transparent group-hover:bg-soft-pink/40",
                                    isActive && "bg-soft-pink group-hover:bg-soft-pink"
                                )}
                            >
                                <Squircle asChild radius={16} autoEffects={false}>
                                    <div
                                        className={cn(
                                            "relative flex h-[62px] w-[62px] overflow-hidden items-center justify-center bg-black4",
                                            isActive && "bg-soft-pink"
                                        )}
                                    >
                                        {imageUrl ? (
                                            <img
                                                src={imageUrl}
                                                alt={name}
                                                className="absolute inset-0 size-full object-cover"
                                            />
                                        ) : (
                                            <span className="text-black font-semibold text-lg">
                                                {name.charAt(0).toUpperCase()}
                                            </span>
                                        )}
                                    </div>
                                </Squircle>
                            </div>
                        </Squircle>
                        {/* Left-edge state pill (the Discord anatomy): tall =
                            active server, short = unread, grows on hover. */}
                        <span
                            aria-hidden
                            className={cn(
                                "absolute left-0 top-1/2 w-1 -translate-y-1/2 rounded-r-full bg-white transition-all duration-200",
                                isActive ? "h-9 opacity-100"
                                    : hasUnread ? "h-2.5 opacity-100 group-hover:h-5"
                                    : "h-2.5 opacity-0 group-hover:h-5 group-hover:opacity-100",
                            )}
                        />
                        {/* Mention badge, bottom-right */}
                        {mentionCount > 0 && (
                            <span
                                aria-label={`${mentionCount} mentions`}
                                className="absolute -bottom-0.5 right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-pastelred px-1 text-[10px] font-bold leading-none text-white ring-[3px] ring-black"
                            >
                                {mentionCount > 99 ? "99+" : mentionCount}
                            </span>
                        )}
                    </button>
                </TooltipTrigger>
                <TooltipContent side="right" align="center">
                    <p className="font-semibold text-sm">{name}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
