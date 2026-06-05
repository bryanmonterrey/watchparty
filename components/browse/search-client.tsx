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

    const handleClear = useCallback(() => {
        setQuery("");
    }, [setQuery]);

    return (
        <div className="flex flex-col min-h-screen">
            <SearchHeader
                value={query}
                onChange={setQuery}
                onBack={handleBack}
                onClear={handleClear}
                placeholder="Search"
            />
            <SearchResultsView query={query} />
        </div>
    );
}
