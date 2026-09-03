import { notFound } from "next/navigation";
import { Metadata } from "next";
import { ALL_CATEGORIES } from "@/lib/data/all-categories";
import { CategoryDetail } from "@/components/categories/category-detail";
import { fallbackShareMetadata, shareMetadata } from "@/lib/share/metadata";

// Category slugs are stored as full paths in the catalog (e.g.
// "/category/grand-theft-auto-v"), so match against `/category/${slug}`.
function findCategory(slug: string) {
    return ALL_CATEGORIES.find((c) => c.slug === `/category/${slug}`);
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string }>;
}): Promise<Metadata> {
    const { slug } = await params;
    const c = findCategory(slug);
    if (!c) return fallbackShareMetadata(`/category/${slug}`, "Category");
    // Box art is portrait, so it goes in the compact thumbnail-left card
    // rather than being stretched across a large one.
    return shareMetadata({
        title: c.title,
        description: `${c.title} streams and coins on watchparty`,
        path: `/category/${slug}`,
        image: c.thumbnailUrl,
        card: "summary",
    });
}

export default async function CategoryDetailPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const category = findCategory(slug);
    if (!category) notFound();
    return <CategoryDetail category={category} />;
}
