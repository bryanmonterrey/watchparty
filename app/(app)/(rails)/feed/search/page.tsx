import { SearchClient } from "@/components/browse/search-client";
import { Metadata } from "next";

// Port of sidebar's (browse)/discover/search/page.tsx.
export const metadata: Metadata = {
    title: "search",
    description: "Search for posts, people, and more.",
};

export default function DiscoverSearchPage() {
    return (
        // bg-canvas (#080808), not bg-background — in dark mode --background is
        // pure black, which read as a different surface from the rest of the app.
        <div className="w-full min-h-svh relative bg-canvas">
            <SearchClient />
        </div>
    );
}
