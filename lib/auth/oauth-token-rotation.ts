// Types from @better-auth/core, not the better-auth root: the root's type
// re-exports hit the same bundler-resolution quirk documented on the
// `betterAuth` import in lib/auth/server.ts.
import type { BetterAuthPlugin, HookEndpointContext } from "@better-auth/core";
import { createAuthMiddleware } from "better-auth/api";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { oauthAccessToken } from "@/db/schema/auth";

// Refresh-token rotation cleanup for the oidc-provider plugin.
//
// Upstream gap (verified in better-auth 1.6.26 dist, oidc-provider/index.mjs
// refresh_token grant): a successful refresh CREATES a new token row but never
// deletes the row holding the presented refresh token — old refresh tokens
// stay live until their 7d expiry, each refresh minting an immortal sliding
// window of valid credentials. This after-hook deletes the presented token's
// row once the grant succeeds, which also kills that row's access token (real
// rotation semantics: one live refresh token per grant chain).
//
// Deletion happens ONLY on success: deleting on failed attempts would let
// anyone who has seen a refresh token burn it with a bad client_secret (DoS).
export const oauthTokenRotation = () =>
    ({
        id: "oauth-token-rotation",
        hooks: {
            after: [
                {
                    matcher: (ctx: HookEndpointContext) => ctx.path === "/oauth2/token",
                    handler: createAuthMiddleware(async (ctx) => {
                        const body = ctx.body as Record<string, unknown> | undefined;
                        if (body?.grant_type !== "refresh_token") return;
                        const presented = body.refresh_token;
                        if (typeof presented !== "string" || !presented) return;
                        // dispatch.mjs stores the endpoint's response on
                        // ctx.context.returned. Success is the token payload
                        // object; APIError/Response forms mean failure → skip.
                        const returned = ctx.context.returned as unknown;
                        if (
                            !returned ||
                            typeof returned !== "object" ||
                            returned instanceof Response ||
                            !("access_token" in (returned as Record<string, unknown>))
                        ) {
                            return;
                        }
                        // The new row carries a freshly generated refreshToken,
                        // so this only ever removes the superseded row.
                        await db
                            .delete(oauthAccessToken)
                            .where(eq(oauthAccessToken.refreshToken, presented));
                    }),
                },
            ],
        },
    }) satisfies BetterAuthPlugin;
