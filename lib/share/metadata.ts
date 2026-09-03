import type { Metadata } from "next";

// The one place a page's share tags come from. See docs/share-cards-plan.md.
//
// Why a helper and not per-page objects: Next merges `openGraph` and `twitter`
// SHALLOWLY across segments — a page that sets `openGraph: { title }` drops
// the root's `images`, `siteName` and `type` on the floor and unfurls with no
// image. Every page spreads `shareMetadata()` instead, so the tag set is
// always complete and always carries an image, even when it is the brand
// default.
//
// Deliberately dependency-free: app/layout.tsx imports it, and the root
// layout must stay light (the speed rule in CLAUDE.md).

export const SITE_NAME = "watchparty";
export const SITE_HANDLE = "@watchparty";
export const DEFAULT_DESCRIPTION = "magic internet money meets streaming";

/** Absolute origin every share URL and image is resolved against. */
export const SITE_URL = (() => {
    const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
    // `new URL` throws on garbage, and this runs at module load in the root
    // layout — a typo in the env var must not take the site down.
    try {
        return raw ? new URL(raw).origin : "https://watchparty.xyz";
    } catch {
        return "https://watchparty.xyz";
    }
})();

/**
 * The static brand card, served from public/ so it survives the og-worker
 * being down. Relative on purpose: `metadataBase` in the root layout makes
 * it absolute, which X and Discord require.
 */
export const DEFAULT_OG_IMAGE = {
    url: "/og-default.png",
    width: 1200,
    height: 630,
    alt: "watchparty",
} as const;

export type ShareImage =
    | string
    | { url: string; width?: number; height?: number; alt?: string };

export interface ShareMetadataInput {
    /** Bare page title; the root template appends " / watchparty" to <title>. */
    title: string;
    description?: string | null;
    /** Site-relative path ("/status/abc") — becomes og:url and the canonical. */
    path: string;
    /** Absolute or site-relative image. Omit for the brand default. */
    image?: ShareImage | null;
    type?: "website" | "article" | "profile" | "video.other";
    /**
     * Twitter card shape. `summary_large_image` is the full-width image card
     * (coin, profile, market, text post); `summary` is the compact
     * thumbnail-left card, which is what a raw video thumbnail wants.
     */
    card?: "summary" | "summary_large_image";
    noIndex?: boolean;
}

/** Collapse whitespace and cap the length; crawlers truncate around 200. */
export function clampDescription(text: string | null | undefined, max = 200): string {
    const flat = (text ?? "").replace(/\s+/g, " ").trim();
    if (!flat) return DEFAULT_DESCRIPTION;
    return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

export function shareMetadata(input: ShareMetadataInput): Metadata {
    const description = clampDescription(input.description);
    const image = normalizeImage(input.image);
    const title = input.title.trim() || SITE_NAME;

    return {
        title,
        description,
        alternates: { canonical: input.path },
        openGraph: {
            siteName: SITE_NAME,
            type: input.type ?? "website",
            url: input.path,
            title,
            description,
            images: [image],
        },
        twitter: {
            card: input.card ?? "summary_large_image",
            site: SITE_HANDLE,
            title,
            description,
            images: [image],
        },
        ...(input.noIndex ? { robots: { index: false, follow: false } } : {}),
    };
}

/** What every page falls back to when its lookup fails or the row is missing. */
export function fallbackShareMetadata(path: string, title = SITE_NAME): Metadata {
    return shareMetadata({ title, path, noIndex: true });
}

function normalizeImage(image: ShareImage | null | undefined) {
    if (!image) return { ...DEFAULT_OG_IMAGE };
    if (typeof image === "string") return { url: image, alt: SITE_NAME };
    return { alt: SITE_NAME, ...image };
}
