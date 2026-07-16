"use client";

import { format } from "date-fns";
import { cn } from "@/lib/utils";

export const DEFAULT_BANNER = "#17181C";

// Flat banner palette — brand tokens only, no gradients ever.
export const BANNER_COLORS: { name: string; value: string }[] = [
    { name: "Default", value: DEFAULT_BANNER },
    { name: "Sunset", value: "#FFCC00" },
    { name: "Lantern", value: "#00ED89" },
    { name: "Sky", value: "#1DA1F2" },
    { name: "Royal", value: "oklch(0.6063 0.2145 259.21)" },
    { name: "Rose", value: "#FF746C" },
    { name: "Blossom", value: "oklch(0.95 0.0253 11.58)" },
    { name: "Graphite", value: "#2A2B31" },
];

export function parseTraits(raw: string | null | undefined): string[] {
    return (raw ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 5);
}

// The server profile card — the same anatomy everywhere it appears (the
// live preview in settings, the invite landing): flat banner, squircle-ish
// icon bridging the banner edge, name + tag, meta, description, traits.
export function ServerProfileCard({
    name,
    imageUrl,
    tag,
    bannerColor,
    bannerImageUrl,
    description,
    traits,
    memberCount,
    createdAt,
    isPrivate = false,
    className,
}: {
    name: string;
    imageUrl: string | null;
    tag?: string | null;
    bannerColor?: string | null;
    /** boost level 1+ perk — wins over bannerColor when set */
    bannerImageUrl?: string | null;
    description?: string | null;
    traits?: string | null;
    memberCount?: number | null;
    createdAt?: string | Date | null;
    /** private invite preview: name + icon only */
    isPrivate?: boolean;
    className?: string;
}) {
    const traitList = parseTraits(traits);

    return (
        <div className={cn("overflow-hidden rounded-3xl bg-white/[0.03]", className)}>
            {bannerImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={bannerImageUrl} alt="" className="h-24 w-full object-cover" />
            ) : (
                <div className="h-24 w-full" style={{ backgroundColor: bannerColor || DEFAULT_BANNER }} />
            )}
            <div className="px-5 pb-5">
                <div className="-mt-8 grid size-16 place-items-center overflow-hidden rounded-[20px] bg-black4 ring-4 ring-background">
                    {imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imageUrl} alt="" className="size-full object-cover" />
                    ) : (
                        <span className="text-[20px] font-bold text-white/90">{name.charAt(0).toUpperCase() || "?"}</span>
                    )}
                </div>

                <div className="mt-3 flex items-center gap-2">
                    <p className="min-w-0 truncate text-[17px] font-bold tracking-tight text-white">{name}</p>
                    {tag && (
                        <span className="shrink-0 rounded-[8px] bg-white/10 px-1.5 py-0.5 text-[12px] font-bold tracking-wide text-zinc-200">
                            {tag}
                        </span>
                    )}
                </div>

                {isPrivate ? (
                    <p className="mt-1 text-[13px] font-medium text-zinc-500">This server keeps its profile private.</p>
                ) : (
                    <>
                        {(memberCount != null || createdAt) && (
                            <p className="mt-1 flex items-center gap-1.5 text-[13px] font-medium text-zinc-500">
                                {memberCount != null && (
                                    <>
                                        <span className="inline-block size-2 rounded-full bg-lantern" />
                                        {memberCount} member{memberCount === 1 ? "" : "s"}
                                    </>
                                )}
                                {memberCount != null && createdAt && <span className="text-zinc-700">·</span>}
                                {createdAt && <>Est. {format(new Date(createdAt), "MMM yyyy")}</>}
                            </p>
                        )}

                        {description && (
                            <p className="mt-3 line-clamp-3 text-[14px] font-medium leading-relaxed text-zinc-400">
                                {description}
                            </p>
                        )}

                        {traitList.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                                {traitList.map((t) => (
                                    <span
                                        key={t}
                                        className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[13px] font-semibold text-zinc-300"
                                    >
                                        {t}
                                    </span>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
