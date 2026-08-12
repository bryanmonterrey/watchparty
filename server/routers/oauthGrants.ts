import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/db";
import { oauthApplication, oauthAccessToken, oauthConsent } from "@/db/schema/auth";
import { developerApps } from "@/db/schema/content/developer-app";
import { describeScopes } from "@/lib/developer/oauth-scopes";
import { limitOrPass, webhookMutationLimiter } from "@/lib/rate-limit";
import { TRPCError } from "@trpc/server";

// The USER's side of "Sign in with watchparty": which third-party apps hold a
// grant on my account, and the revoke button the consent screen promises.
// (The developer side — disable/rotate/delete the client — lives in
// developerApps; this is per-user, per-client.)
//
// Revocation = deleting the user's oauthConsent rows AND their token rows for
// that client. Deleting tokens is the real revocation (userinfo never checks
// consent after issuance); deleting consent makes the next authorize show the
// consent screen again instead of silently re-issuing.

export const oauthGrantsRouter = router({
    /** Apps the signed-in user has approved, newest grant first. */
    list: protectedProcedure.query(async ({ ctx }) => {
        const consents = await db
            .select({
                clientId: oauthConsent.clientId,
                scopes: oauthConsent.scopes,
                createdAt: oauthConsent.createdAt,
            })
            .from(oauthConsent)
            .where(and(eq(oauthConsent.userId, ctx.user.id), eq(oauthConsent.consentGiven, true)))
            .orderBy(desc(oauthConsent.createdAt));
        if (consents.length === 0) return [];

        // Consent rows accumulate by design (the endpoint inserts
        // unconditionally) — collapse to one entry per client, keeping the
        // newest row's scopes (the last thing the user actually approved).
        const byClient = new Map<string, { scopes: string; grantedAt: Date }>();
        for (const c of consents) {
            if (!byClient.has(c.clientId)) byClient.set(c.clientId, { scopes: c.scopes, grantedAt: c.createdAt });
        }

        const clientIds = [...byClient.keys()];
        const clients = await db
            .select({
                clientId: oauthApplication.clientId,
                name: oauthApplication.name,
                icon: oauthApplication.icon,
                disabled: oauthApplication.disabled,
            })
            .from(oauthApplication)
            .where(inArray(oauthApplication.clientId, clientIds));
        const apps = await db
            .select({ oauthClientId: developerApps.oauthClientId, websiteUrl: developerApps.websiteUrl })
            .from(developerApps)
            .where(inArray(developerApps.oauthClientId, clientIds));
        const websiteByClient = new Map(apps.map((a) => [a.oauthClientId, a.websiteUrl]));

        return clients.map((c) => {
            const grant = byClient.get(c.clientId)!;
            return {
                clientId: c.clientId,
                name: c.name,
                icon: c.icon,
                disabled: c.disabled,
                websiteUrl: websiteByClient.get(c.clientId) ?? null,
                grantedAt: grant.grantedAt,
                scopes: describeScopes(grant.scopes).map(({ scope, label, desc }) => ({ scope, label, desc })),
            };
        });
    }),

    /** Revoke an app's access to MY account: my consent rows + my tokens. */
    revoke: protectedProcedure
        .input(z.object({ clientId: z.string().min(1).max(128) }))
        .mutation(async ({ ctx, input }) => {
            if (!(await limitOrPass(webhookMutationLimiter, ctx.user.id))) {
                throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Wait a minute and try again" });
            }
            // Scoped to the CALLER — a clientId that isn't theirs deletes
            // nothing (idempotent, nothing to probe).
            await db
                .delete(oauthAccessToken)
                .where(and(eq(oauthAccessToken.clientId, input.clientId), eq(oauthAccessToken.userId, ctx.user.id)));
            await db
                .delete(oauthConsent)
                .where(and(eq(oauthConsent.clientId, input.clientId), eq(oauthConsent.userId, ctx.user.id)));
            return { success: true };
        }),
});
