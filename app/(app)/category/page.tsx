import { Metadata } from "next";
import { HOME_CATEGORIES } from "@/lib/data/home-categories";
import { CategoryCard } from "@/components/categories/category-card";

export const metadata: Metadata = {
    title: "Browse categories",
};

// Full categories index — the "View all" target from the home Categories row
// and the "See all" target from the search landing. Static art from
// HOME_CATEGORIES; no data fetch, so this renders instantly.
export default function CategoriesPage() {
    return (
        <div className="w-full px-5 pt-20 pb-16 md:px-8 md:pt-24">
            <h1 className="mb-6 text-2xl font-extrabold tracking-tight md:text-3xl">Browse categories</h1>
            <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {HOME_CATEGORIES.map((c, i) => (
                    <CategoryCard
                        key={c.slug}
                        c={c}
                        index={i}
                        count={HOME_CATEGORIES.length}
                        className="w-full shrink"
                    />
                ))}
            </div>
        </div>
    );
}
