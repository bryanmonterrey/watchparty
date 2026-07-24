import { DiscoverClient } from "@/components/browse/discover-client";
import { Metadata } from "next";

// Port of sidebar's (browse)/discover/page.tsx.
export const metadata: Metadata = {
    title: "Discover",
    description: "Explore the latest bangers, following feed, and bookmarks.",
};

export default function DiscoverPage() {
    return (
        <div className="w-full relative">
            <DiscoverClient />
        </div>
    );
}
