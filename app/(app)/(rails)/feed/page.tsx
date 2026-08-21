import { DiscoverClient } from "@/components/browse/discover-client";
import { ProgressiveEntry } from "@/components/app-ui/progressive-entry";
import FeedLoading from "./loading";
import { Metadata } from "next";

// Port of sidebar's (browse)/discover/page.tsx.
export const metadata: Metadata = {
    title: "feed",
    description: "The latest bangers, your following feed, and bookmarks.",
};

export default function DiscoverPage() {
    return (
        <div className="w-full relative">
            {/* First client commit paints the same shell loading.tsx serves;
                the feed enters in a transition — see ProgressiveEntry. */}
            <ProgressiveEntry shell={<FeedLoading />}>
                <DiscoverClient />
            </ProgressiveEntry>
        </div>
    );
}
