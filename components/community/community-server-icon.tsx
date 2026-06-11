"use client";

import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

type CommunityServerIconProps = {
    id: string;
    imageUrl: string | null;
    name: string;
};

export function CommunityServerIcon({ id, imageUrl, name }: CommunityServerIconProps) {
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
]                        <div
                            className={cn(
                                "relative flex h-[44px] w-[44px] rounded-[16px] group-hover:rounded-[14px] transition-all items-center justify-center",
                                "ring-0 group-hover:ring-2 ring-soft-pink/40",
                                isActive && "ring-2 ring-soft-pink"
                            )}
                        >
                            <div
                                className={cn(
                                    "relative flex h-full w-full rounded-[inherit] overflow-hidden items-center justify-center bg-black4",
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
                                    <span className="text-white font-semibold text-lg">
                                        {name.charAt(0).toUpperCase()}
                                    </span>
                                )}
                            </div>
                        </div>
                    </button>
                </TooltipTrigger>
                <TooltipContent side="right" align="center">
                    <p className="font-semibold text-sm">{name}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
