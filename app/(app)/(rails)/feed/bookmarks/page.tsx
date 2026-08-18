import { BookmarksFeed } from "@/components/browse/bookmarks-feed";
import { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";

// Port of sidebar's (browse)/discover/bookmarks/page.tsx.
export const metadata: Metadata = {
    title: "bookmarks",
    description: "Your bookmarked posts on Watchparty.",
};

export default function BookmarksPage() {
    return (
        <div className="w-full min-h-screen">
            <div className="flex flex-row items-center justify-start gap-5 backdrop-blur-sm w-full bg-black/40 sticky top-0 z-100 border-b border-flexborder">
                <div className="flex h-full">
                    <Link
                        href="/feed"
                        className="px-4 cursor-pointer h-13 flex items-center justify-center text-zinc-300 hover:text-white hover:bg-zinc-500/20 transition-colors"
                    >
                        <ChevronLeft className="w-7 h-7" />
                    </Link>
                </div>
                <div className="flex items-center justify-center">
                    <span className="font-extrabold text-zinc-100 text-lg">Bookmarks</span>
                </div>
            </div>

            <BookmarksFeed />
        </div>
    );
}
