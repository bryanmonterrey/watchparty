// Stub for optional better-auth feature packages we do not install.
//
// @better-auth/infra 0.4.0 reaches for `@better-auth/scim` and
// `@better-auth/sso` through dynamic `import()` on SCIM-catalog and SAML-policy
// code paths. Both are genuinely optional at runtime — but infra declares
// neither as a dependency nor an optional peer, so the bundler still has to
// resolve them and `next build` fails with "Module not found" before any of
// that code could run. (tsc is happy; this only shows up at build time.)
//
// Installing them instead would put two unused auth packages into a worker
// with ~848 KiB of headroom under Cloudflare's 10 MiB gzip ceiling, to support
// features this app does not have.
//
// The proxy is so that IF a SCIM/SSO path is ever taken, the failure names the
// cause instead of surfacing as "undefined is not a function" three frames deep.
const message =
    "This build stubs @better-auth/scim and @better-auth/sso (see " +
    "lib/absent-optional-module-stub.js). Reaching this code means a SCIM or SSO " +
    "feature was enabled — install the real package and drop the resolveAlias in " +
    "next.config.ts.";

module.exports = new Proxy(
    {},
    {
        get(_target, prop) {
            // Let module-shape probes answer falsily rather than throw.
            if (prop === "__esModule" || typeof prop === "symbol") return undefined;
            throw new Error(message);
        },
    },
);
