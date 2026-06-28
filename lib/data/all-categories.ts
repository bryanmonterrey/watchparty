import raw from "@/kick_categories.json";
import type { HomeCategory } from "./home-categories";

// The full category catalog (612 entries, ordered by popularity) sourced from
// kick_categories.json — thumbnails live in public/thumbnails. HOME_CATEGORIES
// is the curated top slice used for the home carousel row; this is the complete
// list backing the /category index and category-detail slug resolution.
export const ALL_CATEGORIES: HomeCategory[] = (
    raw as Array<{ title: string; slug: string; thumbnailUrl: string; tags: string[] }>
).map((c) => ({
    title: c.title,
    slug: c.slug,
    thumbnailUrl: c.thumbnailUrl,
    tags: c.tags,
}));
