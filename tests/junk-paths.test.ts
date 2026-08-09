import { describe, expect, test } from "bun:test";

import { isJunkPath, isWriteToProfilePath } from "@/lib/security/junk-paths";

/**
 * The asymmetry is the whole point of this test.
 *
 * A miss costs a scanner one cheap 200 instead of one cheap 404 — nothing.
 * A FALSE POSITIVE 404s a real page in middleware, before anything renders,
 * with no cache to fail open through and no way for the app to recover. So the
 * "must not match" half matters far more than the "must match" half, and it is
 * the half that would break silently: nobody probes their own site for
 * regressions.
 */

describe("junk paths", () => {
    test("matches the probes measured returning 200 + ~93KB in production", () => {
        for (const p of [
            "/wp-admin/setup-config.php",
            "/.git/config",
            "/.env",
            "/xmlrpc.php",
            "/wp-login.php",
            "/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php",
        ]) {
            expect(isJunkPath(p)).toBe(true);
        }
    });

    test("matches regardless of case", () => {
        expect(isJunkPath("/WP-ADMIN/install.php")).toBe(true);
        expect(isJunkPath("/Index.PHP")).toBe(true);
    });

    test("matches the bare prefix as well as paths under it", () => {
        expect(isJunkPath("/wp-admin")).toBe(true);
        expect(isJunkPath("/wp-admin/")).toBe(true);
        expect(isJunkPath("/.git")).toBe(true);
    });

    test("does NOT match real routes", () => {
        for (const p of [
            "/",
            "/home",
            "/login",
            "/feed",
            "/trade",
            "/premium",
            "/messages",
            "/communities/abc/channels/def",
            "/coin/So11111111111111111111111111111111111111112",
            "/status/123",
            "/api/trpc/community.getMessages",
            "/api/webhooks/helius-trades",
            "/api/rpc",
        ]) {
            expect(isJunkPath(p)).toBe(false);
        }
    });

    test("does NOT match usernames, including awkward ones", () => {
        // A username is a single segment and goes through the negative cache,
        // never through this. These are the ones most likely to be caught by a
        // sloppier pattern.
        for (const p of [
            "/pipeline",
            "/env",
            "/git",
            "/wordpress",
            "/wp",
            "/admin",
            "/phpdev",
            "/php",
            "/notwp-admin",
        ]) {
            expect(isJunkPath(p)).toBe(false);
        }
    });

    test("does NOT match other dotfiles or extensions", () => {
        // Narrow on purpose — broadening this is how a real asset starts 404ing.
        for (const p of ["/.well-known/security.txt", "/robots.txt", "/sitemap.xml", "/favicon.ico"]) {
            expect(isJunkPath(p)).toBe(false);
        }
    });
});

describe("writes to a profile URL", () => {
    test("refuses non-read methods on a single segment", () => {
        // The measured /pipeline traffic: POST, empty user agent, 200 every time
        // because the negative cache never learns from a request that doesn't
        // render the page.
        for (const m of ["POST", "PUT", "PATCH", "DELETE", "post"]) {
            expect(isWriteToProfilePath("/pipeline", m)).toBe(true);
        }
    });

    test("allows the methods a profile is actually viewed with", () => {
        for (const m of ["GET", "HEAD", "get", "head"]) {
            expect(isWriteToProfilePath("/pipeline", m)).toBe(false);
            expect(isWriteToProfilePath("/somerealuser", m)).toBe(false);
        }
    });

    test("only applies to single-segment paths", () => {
        // tRPC posts here on every mutation in the app — matching it would take
        // the entire data layer down, so this is the assertion that matters.
        expect(isWriteToProfilePath("/api/trpc/community.sendMessage", "POST")).toBe(false);
        expect(isWriteToProfilePath("/api/webhooks/helius-trades", "POST")).toBe(false);
        expect(isWriteToProfilePath("/api/rpc", "POST")).toBe(false);
        expect(isWriteToProfilePath("/communities/a/channels/b", "POST")).toBe(false);
        expect(isWriteToProfilePath("/", "POST")).toBe(false);
    });
});
