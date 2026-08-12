import { describe, expect, test } from "bun:test";

/**
 * The host-rewrite prefix, mirrored from middleware.ts.
 *
 * Copied rather than imported: middleware.ts pulls in better-auth, the rate
 * limiter and the 402 gate at module load, none of which belong in a unit test
 * — the same reason `meetsTier()` lives outside its component. Small enough
 * that the duplication is honest, and the cases below are the contract.
 */
function prefixOnce(prefix: string, pathname: string): string {
    if (pathname === "/") return prefix;
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return pathname;
    return `${prefix}${pathname}`;
}

/**
 * ## The bug this encodes
 *
 * `studio.watchparty.xyz/*` rewrites under `/studio`, `admin.watchparty.xyz/*`
 * under `/admin`. The shells link with absolute hrefs (`/studio/streams`,
 * `/admin/coin-spam`), so the prefix was applied a SECOND time and every nav
 * click 404'd:
 *
 *     studio.watchparty.xyz/studio/streams    404   (shipped, never reported)
 *     admin.watchparty.xyz/admin/coin-spam    404
 *
 * It hides well: the subdomain root works, so the surface looks fine until
 * somebody clicks. Verified live on 2026-08-12 — both hosts served 200 at `/`
 * and 404 one link in.
 */
describe("host rewrite prefixes exactly once", () => {
    test("the subdomain root maps to the route group's index", () => {
        expect(prefixOnce("/admin", "/")).toBe("/admin");
        expect(prefixOnce("/studio", "/")).toBe("/studio");
    });

    test("a bare path gets the prefix", () => {
        expect(prefixOnce("/admin", "/coin-spam")).toBe("/admin/coin-spam");
        expect(prefixOnce("/studio", "/streams")).toBe("/studio/streams");
    });

    test("an ALREADY-prefixed path is left alone — the actual bug", () => {
        expect(prefixOnce("/admin", "/admin/coin-spam")).toBe("/admin/coin-spam");
        expect(prefixOnce("/studio", "/studio/streams")).toBe("/studio/streams");
    });

    test("the prefix itself is idempotent", () => {
        expect(prefixOnce("/admin", "/admin")).toBe("/admin");
        expect(prefixOnce("/studio", "/studio")).toBe("/studio");
    });

    test("a path that merely STARTS WITH the letters is still prefixed", () => {
        // `/administrators` is not under `/admin`, and a naive startsWith
        // without the trailing slash would wrongly leave it alone — then serve
        // a completely different route than the URL asked for.
        expect(prefixOnce("/admin", "/administrators")).toBe("/admin/administrators");
        expect(prefixOnce("/studio", "/studios")).toBe("/studio/studios");
    });

    test("deep paths keep their tail", () => {
        expect(prefixOnce("/studio", "/content/videos/123")).toBe("/studio/content/videos/123");
        expect(prefixOnce("/studio", "/studio/content/videos/123")).toBe("/studio/content/videos/123");
    });

    test("query strings are not this function's business", () => {
        // middleware passes only `pathname`; the URL constructor carries search
        // separately. A prefix that swallowed `?` would drop every filter.
        expect(prefixOnce("/admin", "/coin-spam")).not.toContain("?");
    });
});
