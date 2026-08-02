import { SearchClient } from "@/components/browse/search-client";
import { Metadata } from "next";

// Port of sidebar's (browse)/discover/search/page.tsx.
export const metadata: Metadata = {
    title: "Search",
    description: "Search for posts, people, and more.",
};

export default function DiscoverSearchPage() {
    return (
        <div className="w-full min-h-svh relative bg-background">
            <SearchClient />
        </div>
    );
}
