"use client";

import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Squircle } from "@/components/ui/squircle";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

type CommunityServerIconProps = {
    id: string;
    imageUrl: string | null;
    name: string;
    hasUnread?: boolean;
};

export function CommunityServerIcon({ id, imageUrl, name, hasUnread = false }: CommunityServerIconProps) {
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
                                            <Image
                                                src={imageUrl}
                                                alt={name}
                                                fill
                                                className="object-cover"
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
                        {hasUnread && !isActive && (
                            <span
                                aria-label="Unread activity"
                                className="absolute -right-0.5 -top-0.5 size-3 rounded-full bg-white ring-2 ring-black"
                            />
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
