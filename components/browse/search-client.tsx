"use client";

import { useQueryState } from "nuqs";
import { SearchHeader } from "./search-header";
import { SearchResultsView } from "./search-results-view";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

export function SearchClient() {
    const router = useRouter();
    const [query, setQuery] = useQueryState("q", { 
        defaultValue: "",
        shallow: true,
        clearOnDefault: true
    });

    const handleBack = useCallback(() => {
        router.back();
    }, [router]);

    // No onClear: the bar is GlobalSearch now, and its own clear button reports
    // through onSearch("") — the same path every keystroke takes.
    return (
        <div className="flex flex-col min-h-screen bg-canvas">
            <SearchHeader
                value={query}
                onChange={setQuery}
                onBack={handleBack}
                placeholder="Search"
            />
            <SearchResultsView query={query} />
        </div>
    );
}
