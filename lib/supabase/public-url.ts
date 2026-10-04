// Turn a Supabase Storage object path into its public URL, leaving anything
// that is already a URL alone.
//
// The upload helpers hand back the object PATH ("posts/<user>/<file>"), and at
// least one coin-creation path stored that as `tokens.imageUrl` verbatim
// (2026-10-03: the owner's first coin rendered with no image, and the launch
// would have minted its metadata with a relative "URL"). Idempotent, so it is
// safe at the write site, the read site, and the launch site at once.
const PUBLIC_PREFIX = "/storage/v1/object/public/";

export function publicStorageUrl(pathOrUrl: string): string;
export function publicStorageUrl(pathOrUrl: string | null | undefined): string | null | undefined;
export function publicStorageUrl(pathOrUrl: string | null | undefined) {
    if (!pathOrUrl) return pathOrUrl;
    if (/^(https?:|data:|blob:|\/)/i.test(pathOrUrl)) return pathOrUrl;
    const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
    if (!base) return pathOrUrl;
    return `${base}${PUBLIC_PREFIX}${pathOrUrl.replace(/^\/+/, "")}`;
}
