"use client";

import { BrowseFeed } from "./browse-feed";
import { BookmarkIcon } from "@/components/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function DiscoverClient() {
    const router = useRouter();

    return (
        <BrowseFeed
            onSearchClick={() => router.push("/discover/search")}
            extraTabs={
                <Link
                    href="/discover/bookmarks"
                    className="px-4 bg-black/40 cursor-pointer h-13 flex items-center justify-center gap-2 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-500/20 transition-colors shrink-0 text-sm font-medium"
                >
                    <BookmarkIcon className="w-5 h-5" />
                </Link>
            }
        />
    );
}
