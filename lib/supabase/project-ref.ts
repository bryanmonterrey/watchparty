/**
 * The Supabase project ref out of a URL — or `null` when the URL does not
 * carry one.
 *
 * ## `null` is a real answer, and the whole point of this file
 *
 * A Supabase **custom domain** does not encode the ref in its hostname.
 * `https://cdn.watchparty.xyz` fronts `ugpzuypoyeuiebqbzqcm` — the project is
 * only discoverable from the `sb-project-ref` response header, never from the
 * URL. `.env` uses exactly that domain.
 *
 * An earlier version took the first host label, so it read that URL as the
 * project `"cdn"` and compared it against the real ref. That is not a
 * near-miss, it is a fabricated answer: the write guard threw
 * "supabase-js targets cdn…" on a setup where both sides were the same
 * production project. A comparison is only meaningful when BOTH sides are
 * known, so an unrecognised host must return `null` and let the caller decline
 * to judge.
 *
 * Recognised shapes:
 *   postgres.<ref>:pw@…                  pooler connection string
 *   https://<ref>.supabase.co            API URL
 *   postgresql://…@db.<ref>.supabase.co  direct connection
 */

/** Supabase refs are lowercase alphanumeric, currently 20 chars. */
const REF = "[a-z0-9]{16,}";
const POOLED = new RegExp(`postgres\\.(${REF}):`);
const HOSTED = new RegExp(`^(?:db\\.)?(${REF})\\.supabase\\.(?:co|com|in|net)$`, "i");

export function projectRef(value: string | undefined | null): string | null {
    if (!value) return null;

    // Pooler strings carry it in the user, and the host is shared
    // (aws-0-…pooler.supabase.com), so this must be checked first.
    const pooled = value.match(POOLED)?.[1];
    if (pooled) return pooled;

    let host: string;
    try {
        host = new URL(value).host.toLowerCase();
    } catch {
        return null;
    }
    // Strip a port before matching — direct connections carry :5432.
    return host.replace(/:\d+$/, "").match(HOSTED)?.[1] ?? null;
}
