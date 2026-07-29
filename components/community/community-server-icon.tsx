"use client";

import { useParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

type CommunityServerIconProps = {
    id: string;
    imageUrl: string | null;
    name: string;
    hasUnread?: boolean;
    mentionCount?: number;
};

/**
 * The rail's left-gutter state pill (the Discord anatomy): tall = active,
 * short = unread, grows on hover, absent otherwise. Shared by every tile in
 * the rail — the home/star tile included — so they all read the same way.
 * Anchors to `left-0` of a `w-full` tile button, i.e. the rail's own edge.
 */
export function CommunityRailPill({ isActive, hasUnread = false }: { isActive: boolean; hasUnread?: boolean }) {
    return (
        <span
            aria-hidden
            className={cn(
                "absolute left-0 top-1/2 w-1 -translate-y-1/2 rounded-r-full bg-white transition-all duration-200",
                isActive ? "h-7 opacity-100"
                    : hasUnread ? "h-2 opacity-100 group-hover:h-4"
                    : "h-2 opacity-0 group-hover:h-4 group-hover:opacity-100",
            )}
        />
    );
}

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
                        {/* Circles, not squircles — the star/home tile is the only
                            squircle in the rail. */}
                        <div
                            className={cn(
                                "relative flex size-12 overflow-hidden border-2 border-sidebar-hover/65 items-center justify-center rounded-full transition-colors",
                                isActive
                                    ? "bg-soft-gray-20"
                                    : "bg-soft-gray-15 group-hover:bg-soft-gray-20"
                            )}
                        >
                            {imageUrl && (
                                <img
                                    src={imageUrl}
                                    alt={name}
                                    className="absolute inset-0 size-full object-cover"
                                />
                            )}
                        </div>
                        <CommunityRailPill isActive={isActive} hasUnread={hasUnread} />
                        {/* Mention badge, bottom-right */}
                        {mentionCount > 0 && (
                            <span
                                aria-label={`${mentionCount} mentions`}
                                className="absolute -bottom-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-pastelred px-1 text-[10px] font-bold leading-none text-white ring-[3px] ring-black"
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
