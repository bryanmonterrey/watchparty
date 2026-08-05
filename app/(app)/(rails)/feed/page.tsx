import { DiscoverClient } from "@/components/browse/discover-client";
import { Metadata } from "next";

// Port of sidebar's (browse)/discover/page.tsx.
export const metadata: Metadata = {
    title: "feed",
    description: "The latest bangers, your following feed, and bookmarks.",
};

export default function DiscoverPage() {
    return (
        <div className="w-full relative">
            <DiscoverClient />
        </div>
    );
}
