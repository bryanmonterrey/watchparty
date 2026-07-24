import { notFound } from "next/navigation";
import { Metadata } from "next";
import { ALL_CATEGORIES } from "@/lib/data/all-categories";
import { CategoryDetail } from "@/components/categories/category-detail";

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
    return { title: c ? c.title : "Category" };
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
