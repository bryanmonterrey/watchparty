import { Metadata } from "next";
import { ALL_CATEGORIES } from "@/lib/data/all-categories";
import { CategoryGrid } from "@/components/categories/category-grid";

export const metadata: Metadata = {
    title: "Browse categories",
};

// Full categories index — the "View all" target from the home Categories row
// and the "See all" target from the search landing. CategoryGrid reveals the
// ~600-entry catalog incrementally so the page mounts fast.
export default function CategoriesPage() {
    return (
        <div className="w-full px-5 pt-20 pb-16 md:px-8 md:pt-24">
            <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">Browse categories</h1>
            <p className="mb-6 mt-1 text-sm text-muted-foreground">{ALL_CATEGORIES.length} categories</p>
            <CategoryGrid categories={ALL_CATEGORIES} />
        </div>
    );
}
