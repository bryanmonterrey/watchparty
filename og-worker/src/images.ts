// Remote images (avatars, thumbnails, coin logos) are fetched HERE, with a
// deadline and a host allowlist, and handed to satori as data URIs. Handing
// satori a URL would mean no timeout (workerd has no default — one hung host
// hangs the card for every crawler) and an open image proxy.

const ALLOW: RegExp[] = [
    /(^|\.)supabase\.co$/,
    /(^|\.)watchparty\.xyz$/,
    /^localhost$/,
    /^127\.0\.0\.1$/,
    /(^|\.)dexscreener\.com$/,
    /(^|\.)ipfs\.io$/,
    /(^|\.)nftstorage\.link$/,
    /(^|\.)pinata\.cloud$/,
    /(^|\.)arweave\.net$/,
    /(^|\.)irys\.xyz$/,
    /(^|\.)twimg\.com$/,
    /(^|\.)googleusercontent\.com$/,
    /(^|\.)discordapp\.com$/,
    /(^|\.)githubusercontent\.com$/,
    /(^|\.)jup\.ag$/,
    /(^|\.)coingecko\.com$/,
    /(^|\.)mobula\.io$/,
    /(^|\.)twitch\.tv$/,
    /(^|\.)jtvnw\.net$/,
    /(^|\.)amazonaws\.com$/,
    /(^|\.)cloudfront\.net$/,
];

const MAX_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 2500;

export function allowedImage(url: string): boolean {
    try {
        const u = new URL(url);
        if (u.protocol !== "https:" && !(u.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(u.hostname))) return false;
        return ALLOW.some((re) => re.test(u.hostname));
    } catch {
        return false;
    }
}

/**
 * Supabase Storage can serve a resized copy through its image-transform
 * endpoint. Returns the transformed URL for a public-object URL, else null.
 * (Transforms need a paid Supabase plan; the loader falls back to the
 * original on anything but a 200.)
 */
export function supabaseResized(url: string, width: number): string | null {
    try {
        const u = new URL(url);
        if (!/(^|\.)supabase\.co$/.test(u.hostname)) return null;
        const marker = "/storage/v1/object/public/";
        if (!u.pathname.includes(marker)) return null;
        u.pathname = u.pathname.replace(marker, "/storage/v1/render/image/public/");
        u.searchParams.set("width", String(width));
        u.searchParams.set("quality", "80");
        return u.toString();
    } catch {
        return null;
    }
}

function toBase64(bytes: Uint8Array): string {
    let s = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        s += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(s);
}

async function fetchOne(url: string): Promise<string | null> {
    try {
        const res = await fetch(url, {
            headers: { accept: "image/*" },
            signal: AbortSignal.timeout(TIMEOUT_MS),
            cf: { cacheEverything: true, cacheTtl: 3600 },
        } as RequestInit);
        if (res.status !== 200) return null;
        const type = res.headers.get("content-type")?.split(";")[0].trim() ?? "";
        // resvg decodes PNG, JPEG and GIF only. A WebP/AVIF/SVG body makes
        // satori throw mid-render, which fails the whole card — better to
        // render the fallback tile than no card.
        if (!/^image\/(png|jpeg|jpg|gif)$/.test(type)) return null;
        const buf = new Uint8Array(await res.arrayBuffer());
        if (buf.length === 0 || buf.length > MAX_BYTES) return null;
        return `data:${type};base64,${toBase64(buf)}`;
    } catch {
        return null;
    }
}

/**
 * Data URI for a remote image, or null when it is disallowed, slow, or not an
 * image. Callers render their fallback on null — a blank disc for an avatar,
 * the text variant for a hero.
 */
export async function loadImage(url: string | null | undefined, width = 400): Promise<string | null> {
    if (!url) return null;
    // Anything the composer stored as a data URI is already what satori wants.
    if (url.startsWith("data:image/") && url.length < MAX_BYTES) return url;
    if (!allowedImage(url)) return null;
    const resized = supabaseResized(url, width);
    if (resized) {
        const viaTransform = await fetchOne(resized);
        if (viaTransform) return viaTransform;
    }
    return fetchOne(url);
}

export type Loader = typeof loadImage;
