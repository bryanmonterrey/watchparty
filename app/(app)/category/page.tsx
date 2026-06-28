import { Metadata } from "next";
import { ALL_CATEGORIES } from "@/lib/data/all-categories";
import { CategoryCard } from "@/components/categories/category-card";

export const metadata: Metadata = {
    title: "Browse categories",
};

// Full categories index — the "View all" target from the home Categories row
// and the "See all" target from the search landing. Renders the complete
// catalog (static art, no data fetch); card images lazy-load as you scroll.
export default function CategoriesPage() {
    return (
        <div className="w-full px-5 pt-20 pb-16 md:px-8 md:pt-24">
            <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">Browse categories</h1>
            <p className="mb-6 mt-1 text-sm text-muted-foreground">{ALL_CATEGORIES.length} categories</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {ALL_CATEGORIES.map((c, i) => (
                    <CategoryCard
                        key={c.slug}
                        c={c}
                        index={i}
                        count={ALL_CATEGORIES.length}
                        className="w-full shrink"
                    />
                ))}
            </div>
        </div>
    );
}
