/**
 * Request shapes this app has no route for and never will — scanner probes.
 *
 * ## Why middleware has to answer these
 *
 * `notFound()` inside a page cannot set a 404: by the time it runs the response
 * has begun streaming, and Next's own docs say the status is already sent. The
 * result is a **soft 404** — right page, `noindex`, status **200**. Search
 * engines honour the `noindex`; a scanner reads the status line, sees `200 OK`,
 * and concludes it found something.
 *
 * Measured on production 2026-08-09, all three a full ~93 KB SSR render,
 * uncacheable (`no-store`), ~2s of origin time each:
 *
 *     /wp-admin/setup-config.php   200   92,928 bytes   1.87s
 *     /.git/config                 200   92,870 bytes   1.97s
 *     /.env                        200   94,547 bytes   2.40s
 *
 * That is the same mechanism that saturated the container's 4,096-connection
 * ceiling and took the site down, and it had only ever been closed for
 * single-segment paths (`lib/security/slug-miss-cache.ts`).
 *
 * ## Why this needs no cache and that one does
 *
 * A single-segment slug *might* be a real username, so 404-ing it requires
 * proof — hence the negative cache, which fails open. Nothing matched here can
 * ever be anything: this codebase contains no PHP, serves no dotfiles, and has
 * no route under `/wp-admin/`.
 *
 * ## Deliberately narrow
 *
 * There is no cache to fail open through, so a false positive 404s a real page
 * with no recovery. Each alternative names something that cannot collide with a
 * route. In particular this does **not** match dotfiles beyond `.env`/`.git`,
 * and does not match arbitrary file extensions — `.php` is the one extension
 * safe to blanket-match, and it covers the long tail (`/xmlrpc.php`,
 * `/vendor/phpunit/…/eval-stdin.php`) in a single rule.
 */
const JUNK_PATH =
    /(?:^\/(?:wp-admin|wp-includes|wp-content|wp-login\.php|xmlrpc\.php)(?:\/|$)|^\/\.(?:env|git)(?:\/|$)|\.php$)/i;

/** True when `pathname` is a probe that can be refused without any lookup. */
export function isJunkPath(pathname: string): boolean {
    return JUNK_PATH.test(pathname);
}

/** Reading a page. Everything else aimed at a profile URL is a probe. */
const READ_METHODS = new Set(["GET", "HEAD"]);

/**
 * True when a request is a **write to a profile URL**, which this app has no
 * meaning for.
 *
 * ## Why this is the fix the negative cache couldn't be
 *
 * The `/pipeline` traffic is `POST`, from an empty user agent — 2,048 of them in
 * two hours on 2026-08-09, **every one answered 200 with a ~93 KB render**,
 * while GETs to the identical path answered 404 throughout.
 *
 * `lib/security/slug-miss-cache.ts` can only 404 a slug the *page* has already
 * proven missing, and the page component never runs on this path — which is
 * exactly why the entry was absent every time the POSTs arrived, and why they
 * each paid a full soft-404 render forever. A cache that learns by rendering
 * cannot defend against traffic that never triggers a render.
 *
 * ## Why refusing outright is safe here
 *
 * A profile is only ever fetched. The one thing that legitimately POSTs to a
 * page's own URL is a **Next Server Action**, and this app has none — the data
 * layer is tRPC by design (CLAUDE.md), verified by `grep -rl '"use server"'`
 * returning nothing. tRPC posts to `/api/trpc/*`, which is multi-segment and
 * never reaches this check.
 *
 * ⚠️ If server actions are ever adopted, this must go — a server action invoked
 * from a profile page POSTs to `/<username>` and would be refused here.
 */
export function isWriteToProfilePath(pathname: string, method: string): boolean {
    if (READ_METHODS.has(method.toUpperCase())) return false;
    return /^\/[^/]+$/.test(pathname);
}
