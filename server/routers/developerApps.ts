import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { router, protectedProcedure, publicProcedure } from "@/server/trpc";
import { db } from "@/db";
import { developerApps } from "@/db/schema/content/developer-app";
import { developerBots } from "@/db/schema/content/developer-bot";
import { user } from "@/db/schema/auth/user";
import { oauthApplication, oauthAccessToken, oauthConsent } from "@/db/schema/auth";
import { randHex } from "@/lib/api-gate";
import { generateAppKeypair } from "@/lib/developer/app-keys";
import { computeVerification } from "@/lib/developer/verification";
import { sealSecret } from "@/lib/developer/secret-box";
import { APP_FLAGS, hasFlag } from "@/lib/developer/app-flags";
import { limitOrPass, webhookMutationLimiter } from "@/lib/rate-limit";

// The developer app registry (phase 1 — docs/console-execution-plan.md).
// Apps own credentials and carry an Ed25519 signing identity; the developer
// only ever sees the PUBLIC key. Read procedures never return the sealed
// private key. Identity fields only here — keys/webhooks/bots attach in later
// phases.

const MAX_APPS = 25;

const httpsUrl = z
    .string()
    .trim()
    .max(2048)
    .url()
    .refine((u) => u.startsWith("https://"), { message: "Must be an https URL" });

const identityInput = {
    name: z.string().trim().min(1).max(64),
    description: z.string().trim().max(400).optional(),
    iconUrl: httpsUrl.optional(),
    tags: z.array(z.string().trim().min(1).max(24)).max(5).optional(),
    tosUrl: httpsUrl.optional(),
    privacyUrl: httpsUrl.optional(),
    websiteUrl: httpsUrl.optional(),
};

// Public shape — deliberately omits privateKeyEnc. oauthClientId and flags are
// safe: a client_id is public by protocol, flags carry no secrets.
const publicCols = {
    id: developerApps.id,
    name: developerApps.name,
    description: developerApps.description,
    iconUrl: developerApps.iconUrl,
    tags: developerApps.tags,
    publicKey: developerApps.publicKey,
    tosUrl: developerApps.tosUrl,
    privacyUrl: developerApps.privacyUrl,
    websiteUrl: developerApps.websiteUrl,
    flags: developerApps.flags,
    oauthClientId: developerApps.oauthClientId,
    createdAt: developerApps.createdAt,
    updatedAt: developerApps.updatedAt,
};

// Exact-match redirect URIs for the app's OAuth client. Zod checks STRUCTURE
// (absolute URL, no fragment per RFC 6749 §3.1.2, and no commas — the
// oidc-provider plugin stores the list comma-joined, so one comma would
// corrupt every entry on split). The SCHEME policy depends on the client's
// type, so it's enforced in-handler by assertRedirectPolicy below.
const redirectUri = z
    .string()
    .trim()
    .min(1)
    .max(2048)
    .superRefine((u, refCtx) => {
        if (u.includes(",")) {
            refCtx.addIssue({ code: "custom", message: "Commas are not allowed in redirect URIs" });
            return;
        }
        let parsed: URL;
        try {
            parsed = new URL(u);
        } catch {
            refCtx.addIssue({ code: "custom", message: "Not a valid absolute URL" });
            return;
        }
        if (parsed.hash) {
            refCtx.addIssue({ code: "custom", message: "Redirect URIs must not contain a fragment" });
        }
    });

const redirectUriList = z.array(redirectUri).min(1).max(10);

/** Scheme policy by client type: web (confidential) = https, http only for
 *  localhost dev. public (native, PKCE-only) = additionally custom app
 *  schemes (`myapp://cb`) — but NEVER plain http off localhost. */
function assertRedirectPolicy(uris: string[], type: "web" | "public"): void {
    for (const u of uris) {
        const parsed = new URL(u);
        const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
        if (parsed.protocol === "https:") continue;
        if (parsed.protocol === "http:" && isLocal) continue;
        if (type === "public" && parsed.protocol !== "http:") continue;
        throw new TRPCError({
            code: "BAD_REQUEST",
            message:
                type === "public"
                    ? "Public clients may use https, localhost http, or a custom app scheme"
                    : "Redirect URIs must be https (http is allowed only for localhost)",
        });
    }
}

function isLocalhostUri(u: string): boolean {
    try {
        const parsed = new URL(u);
        return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    } catch {
        return true; // unparseable never counts as prod-ready
    }
}

async function throttle(userId: string): Promise<void> {
    if (!(await limitOrPass(webhookMutationLimiter, userId))) {
        throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Too many changes — wait a minute and try again",
        });
    }
}

/** Load an owned, non-deleted app or throw NOT_FOUND (RLS-independent guard). */
async function ownedApp(userId: string, id: string) {
    const [app] = await db
        .select(publicCols)
        .from(developerApps)
        .where(and(
            eq(developerApps.id, id),
            eq(developerApps.ownerId, userId),
            isNull(developerApps.deletedAt),
        ))
        .limit(1);
    if (!app) throw new TRPCError({ code: "NOT_FOUND" });
    return app;
}

export const developerAppsRouter = router({
    list: protectedProcedure.query(async ({ ctx }) => {
        return db
            .select(publicCols)
            .from(developerApps)
            .where(and(eq(developerApps.ownerId, ctx.user.id), isNull(developerApps.deletedAt)))
            .orderBy(desc(developerApps.createdAt));
    }),

    get: protectedProcedure
        .input(z.object({ id: z.string() }))
        .query(({ ctx, input }) => ownedApp(ctx.user.id, input.id)),

    // Discord §9 verification checklist — self-evaluated trust criteria for an
    // app before it scales or lists publicly. Computed server-side from the app
    // + owner account so the console just renders ✓/⚠ rows and a "missing n"
    // summary. Human review for privileged scopes is a later, queue-backed row.
    verificationChecklist: protectedProcedure
        .input(z.object({ appId: z.string() }))
        .query(async ({ ctx, input }) => {
            const [row] = await db
                .select({
                    name: developerApps.name,
                    description: developerApps.description,
                    iconUrl: developerApps.iconUrl,
                    tosUrl: developerApps.tosUrl,
                    privacyUrl: developerApps.privacyUrl,
                    emailVerified: user.emailVerified,
                    twoFactorEnabled: user.twoFactorEnabled,
                })
                .from(developerApps)
                .innerJoin(user, eq(user.id, developerApps.ownerId))
                .where(and(
                    eq(developerApps.id, input.appId),
                    eq(developerApps.ownerId, ctx.user.id),
                    isNull(developerApps.deletedAt),
                ))
                .limit(1);
            if (!row) throw new TRPCError({ code: "NOT_FOUND" });
            return computeVerification(row);
        }),

    // Batch verification state for the apps list — one row per app, counts only.
    // Shares computeVerification with the detail query so the list badge and the
    // card can never disagree. Owner email/2FA is the same for every app, so
    // it's read once and folded into each.
    verificationSummary: protectedProcedure.query(async ({ ctx }) => {
        const [owner] = await db
            .select({ emailVerified: user.emailVerified, twoFactorEnabled: user.twoFactorEnabled })
            .from(user)
            .where(eq(user.id, ctx.user.id))
            .limit(1);
        const apps = await db
            .select({
                id: developerApps.id,
                name: developerApps.name,
                description: developerApps.description,
                iconUrl: developerApps.iconUrl,
                tosUrl: developerApps.tosUrl,
                privacyUrl: developerApps.privacyUrl,
            })
            .from(developerApps)
            .where(and(eq(developerApps.ownerId, ctx.user.id), isNull(developerApps.deletedAt)));

        const out: Record<string, { met: number; total: number; complete: boolean }> = {};
        for (const a of apps) {
            const { met, total, complete } = computeVerification({
                ...a,
                emailVerified: owner?.emailVerified ?? false,
                twoFactorEnabled: owner?.twoFactorEnabled ?? false,
            });
            out[a.id] = { met, total, complete };
        }
        return out;
    }),

    create: protectedProcedure
        .input(z.object(identityInput))
        .mutation(async ({ ctx, input }) => {
            if (!process.env.API_GATE_SECRET) {
                throw new TRPCError({
                    code: "PRECONDITION_FAILED",
                    message: "The developer platform is not enabled on this deployment",
                });
            }
            await throttle(ctx.user.id);

            const [{ n }] = await db
                .select({ n: count() })
                .from(developerApps)
                .where(and(eq(developerApps.ownerId, ctx.user.id), isNull(developerApps.deletedAt)));
            if (n >= MAX_APPS) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: `You're at the ${MAX_APPS}-app limit — delete one first`,
                });
            }

            const { publicKey, privateKeyEnc } = await generateAppKeypair();
            const id = `wpapp_${randHex(8)}`;
            await db.insert(developerApps).values({
                id,
                ownerId: ctx.user.id,
                name: input.name,
                description: input.description ?? null,
                iconUrl: input.iconUrl ?? null,
                tags: input.tags ?? [],
                publicKey,
                privateKeyEnc,
                tosUrl: input.tosUrl ?? null,
                privacyUrl: input.privacyUrl ?? null,
                websiteUrl: input.websiteUrl ?? null,
            });
            return { id };
        }),

    update: protectedProcedure
        .input(z.object({ id: z.string(), ...identityInput }).partial({ name: true }))
        .mutation(async ({ ctx, input }) => {
            await throttle(ctx.user.id);
            const { id, ...fields } = input;
            const updated = await db
                .update(developerApps)
                .set({
                    ...(fields.name !== undefined ? { name: fields.name } : {}),
                    ...(fields.description !== undefined ? { description: fields.description || null } : {}),
                    ...(fields.iconUrl !== undefined ? { iconUrl: fields.iconUrl || null } : {}),
                    ...(fields.tags !== undefined ? { tags: fields.tags } : {}),
                    ...(fields.tosUrl !== undefined ? { tosUrl: fields.tosUrl || null } : {}),
                    ...(fields.privacyUrl !== undefined ? { privacyUrl: fields.privacyUrl || null } : {}),
                    ...(fields.websiteUrl !== undefined ? { websiteUrl: fields.websiteUrl || null } : {}),
                    updatedAt: new Date(),
                })
                .where(and(
                    eq(developerApps.id, id),
                    eq(developerApps.ownerId, ctx.user.id),
                    isNull(developerApps.deletedAt),
                ))
                .returning({ id: developerApps.id });
            if (!updated.length) throw new TRPCError({ code: "NOT_FOUND" });
            return { success: true };
        }),

    /** Roll the Ed25519 identity — old signatures stop verifying immediately. */
    rotateKey: protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await throttle(ctx.user.id);
            const { publicKey, privateKeyEnc } = await generateAppKeypair();
            const updated = await db
                .update(developerApps)
                .set({ publicKey, privateKeyEnc, updatedAt: new Date() })
                .where(and(
                    eq(developerApps.id, input.id),
                    eq(developerApps.ownerId, ctx.user.id),
                    isNull(developerApps.deletedAt),
                ))
                .returning({ id: developerApps.id });
            if (!updated.length) throw new TRPCError({ code: "NOT_FOUND" });
            return { publicKey };
        }),

    /** Soft delete — the id is public and must never be reused. */
    remove: protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await throttle(ctx.user.id);
            const updated = await db
                .update(developerApps)
                .set({ deletedAt: new Date() })
                .where(and(
                    eq(developerApps.id, input.id),
                    eq(developerApps.ownerId, ctx.user.id),
                    isNull(developerApps.deletedAt),
                ))
                .returning({ id: developerApps.id, oauthClientId: developerApps.oauthClientId });
            if (!updated.length) throw new TRPCError({ code: "NOT_FOUND" });
            // Deleting the app revokes its bot: drop the bot's user row (cascades
            // to developer_bots), so the token stops resolving and no is_bot ghost
            // account is left squatting a username. The app soft-deletes for audit;
            // the bot hard-deletes because a credential the owner can no longer see
            // or rotate (get/reset filter on the live app) must not keep working.
            const [bot] = await db
                .select({ botUserId: developerBots.botUserId })
                .from(developerBots)
                .where(eq(developerBots.appId, input.id))
                .limit(1);
            if (bot) await db.delete(user).where(eq(user.id, bot.botUserId));
            // Same rule for the OAuth client: disable it AND delete its issued
            // tokens + consents. Deleting tokens is the actual revocation —
            // /oauth2/userinfo never checks client.disabled (verified 1.6.26),
            // so a merely-disabled client's live tokens would keep working.
            // The client row itself stays for audit (client_id is public).
            if (updated[0].oauthClientId) {
                await revokeOAuthClient(updated[0].oauthClientId);
            }
            return { success: true };
        }),

    // ── OAuth2 client ("Sign in with watchparty") ─────────────────────────
    // One client per app, managed only through here — the plugin's own
    // /oauth2/register endpoint is 404'd at the edge (middleware.ts) because
    // it would let any session holder bypass this ownership model.

    getOAuthClient: protectedProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ ctx, input }) => {
            const app = await ownedApp(ctx.user.id, input.id);
            if (!app.oauthClientId) return null;
            const [client] = await db
                .select({
                    clientId: oauthApplication.clientId,
                    redirectUrls: oauthApplication.redirectUrls,
                    type: oauthApplication.type,
                    disabled: oauthApplication.disabled,
                    createdAt: oauthApplication.createdAt,
                })
                .from(oauthApplication)
                .where(eq(oauthApplication.clientId, app.oauthClientId))
                .limit(1);
            if (!client) return null;
            return {
                clientId: client.clientId,
                redirectUris: client.redirectUrls.split(",").filter(Boolean),
                type: client.type,
                disabled: client.disabled,
                createdAt: client.createdAt,
                listed: hasFlag(app.flags, APP_FLAGS.LISTED),
            };
        }),

    createOAuthClient: protectedProcedure
        .input(z.object({
            id: z.string(),
            redirectUris: redirectUriList,
            // web = confidential (server-side, gets a secret). public =
            // native/SPA, PKCE-only — the token endpoint skips the secret
            // check for type "public" (verified in plugin source).
            type: z.enum(["web", "public"]).default("web"),
        }))
        .mutation(async ({ ctx, input }) => {
            if (!process.env.API_GATE_SECRET) {
                throw new TRPCError({
                    code: "PRECONDITION_FAILED",
                    message: "The developer platform is not enabled on this deployment",
                });
            }
            await throttle(ctx.user.id);
            const app = await ownedApp(ctx.user.id, input.id);
            if (app.oauthClientId) {
                throw new TRPCError({
                    code: "CONFLICT",
                    message: "This app already has an OAuth client — rotate its secret instead",
                });
            }
            assertRedirectPolicy(input.redirectUris, input.type);

            const clientId = `wpcl_${randHex(12)}`;
            // 64 hex chars (256 bits) — shown to the owner exactly once below,
            // stored only sealed (AES-GCM via secret-box). Public clients get
            // NO secret: PKCE is their whole proof.
            const clientSecret = input.type === "web" ? randHex(32) : null;
            const now = new Date();
            await db.insert(oauthApplication).values({
                id: crypto.randomUUID(),
                name: app.name,
                icon: app.iconUrl,
                // Joined back to the app world; the plugin JSON.parses this
                // unguarded, so it must stay valid JSON (or null).
                metadata: JSON.stringify({ appId: app.id }),
                clientId,
                clientSecret: clientSecret ? await sealSecret(clientSecret) : null,
                redirectUrls: input.redirectUris.join(","),
                type: input.type,
                disabled: false,
                userId: ctx.user.id,
                createdAt: now,
                updatedAt: now,
            });
            await db
                .update(developerApps)
                .set({ oauthClientId: clientId, updatedAt: now })
                .where(eq(developerApps.id, app.id));
            // The secret is returned ONCE — the view-once panel is the only UI
            // that ever sees it.
            return { clientId, clientSecret, type: input.type };
        }),

    updateOAuthRedirects: protectedProcedure
        .input(z.object({ id: z.string(), redirectUris: redirectUriList }))
        .mutation(async ({ ctx, input }) => {
            await throttle(ctx.user.id);
            const app = await ownedApp(ctx.user.id, input.id);
            if (!app.oauthClientId) throw new TRPCError({ code: "NOT_FOUND" });
            const [existing] = await db
                .select({ type: oauthApplication.type })
                .from(oauthApplication)
                .where(eq(oauthApplication.clientId, app.oauthClientId))
                .limit(1);
            if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
            assertRedirectPolicy(input.redirectUris, existing.type === "public" ? "public" : "web");
            // A listed app must never point at localhost — delist first.
            if (
                hasFlag(app.flags, APP_FLAGS.LISTED) &&
                input.redirectUris.some(isLocalhostUri)
            ) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "Listed apps can't use localhost redirect URIs — unlist first",
                });
            }
            await db
                .update(oauthApplication)
                .set({ redirectUrls: input.redirectUris.join(","), updatedAt: new Date() })
                .where(eq(oauthApplication.clientId, app.oauthClientId));
            return { redirectUris: input.redirectUris };
        }),

    rotateOAuthSecret: protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await throttle(ctx.user.id);
            const app = await ownedApp(ctx.user.id, input.id);
            if (!app.oauthClientId) throw new TRPCError({ code: "NOT_FOUND" });
            const [existing] = await db
                .select({ type: oauthApplication.type })
                .from(oauthApplication)
                .where(eq(oauthApplication.clientId, app.oauthClientId))
                .limit(1);
            if (existing?.type === "public") {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Public clients have no secret — PKCE is their proof" });
            }
            const clientSecret = randHex(32);
            await db
                .update(oauthApplication)
                .set({ clientSecret: await sealSecret(clientSecret), updatedAt: new Date() })
                .where(eq(oauthApplication.clientId, app.oauthClientId));
            return { clientId: app.oauthClientId, clientSecret };
        }),

    setOAuthClientDisabled: protectedProcedure
        .input(z.object({ id: z.string(), disabled: z.boolean() }))
        .mutation(async ({ ctx, input }) => {
            await throttle(ctx.user.id);
            const app = await ownedApp(ctx.user.id, input.id);
            if (!app.oauthClientId) throw new TRPCError({ code: "NOT_FOUND" });
            if (input.disabled) {
                await revokeOAuthClient(app.oauthClientId);
            } else {
                await db
                    .update(oauthApplication)
                    .set({ disabled: false, updatedAt: new Date() })
                    .where(eq(oauthApplication.clientId, app.oauthClientId));
            }
            return { disabled: input.disabled };
        }),

    // ── Public directory ──────────────────────────────────────────────────

    /** Owner opts the app in/out of the public directory. Listing re-checks
     *  the verification checklist server-side — the badge gate is here, not
     *  in the UI. */
    setListed: protectedProcedure
        .input(z.object({ id: z.string(), listed: z.boolean() }))
        .mutation(async ({ ctx, input }) => {
            await throttle(ctx.user.id);
            const app = await ownedApp(ctx.user.id, input.id);

            if (!input.listed) {
                await db
                    .update(developerApps)
                    .set({ flags: sql`${developerApps.flags} & ~${APP_FLAGS.LISTED}`, updatedAt: new Date() })
                    .where(eq(developerApps.id, app.id));
                return { listed: false };
            }

            // Listing requirements, all server-enforced:
            // 1. verification checklist complete (profile/tos/privacy/email/2fa)
            const [owner] = await db
                .select({ emailVerified: user.emailVerified, twoFactorEnabled: user.twoFactorEnabled })
                .from(user)
                .where(eq(user.id, ctx.user.id))
                .limit(1);
            const verification = computeVerification({
                name: app.name,
                description: app.description,
                iconUrl: app.iconUrl,
                tosUrl: app.tosUrl,
                privacyUrl: app.privacyUrl,
                emailVerified: owner?.emailVerified ?? false,
                twoFactorEnabled: owner?.twoFactorEnabled ?? false,
            });
            if (!verification.complete) {
                throw new TRPCError({
                    code: "PRECONDITION_FAILED",
                    message: "Complete the verification checklist before listing",
                });
            }
            // 2. a configured, enabled OAuth client with no localhost redirects
            if (!app.oauthClientId) {
                throw new TRPCError({
                    code: "PRECONDITION_FAILED",
                    message: "Set up the app's OAuth client before listing",
                });
            }
            const [client] = await db
                .select({ redirectUrls: oauthApplication.redirectUrls, disabled: oauthApplication.disabled })
                .from(oauthApplication)
                .where(eq(oauthApplication.clientId, app.oauthClientId))
                .limit(1);
            if (!client || client.disabled) {
                throw new TRPCError({
                    code: "PRECONDITION_FAILED",
                    message: "The app's OAuth client is disabled",
                });
            }
            if (client.redirectUrls.split(",").filter(Boolean).some(isLocalhostUri)) {
                throw new TRPCError({
                    code: "PRECONDITION_FAILED",
                    message: "Remove localhost redirect URIs before listing",
                });
            }

            await db
                .update(developerApps)
                .set({ flags: sql`${developerApps.flags} | ${APP_FLAGS.LISTED}`, updatedAt: new Date() })
                .where(eq(developerApps.id, app.id));
            return { listed: true };
        }),

    /** The public "Connect with watchparty" directory. Anonymous-readable;
     *  only listed, live, OAuth-enabled apps; only public columns. */
    directory: publicProcedure.query(async () => {
        return db
            .select({
                id: developerApps.id,
                name: developerApps.name,
                description: developerApps.description,
                iconUrl: developerApps.iconUrl,
                tags: developerApps.tags,
                websiteUrl: developerApps.websiteUrl,
                oauthClientId: developerApps.oauthClientId,
            })
            .from(developerApps)
            .where(and(
                isNull(developerApps.deletedAt),
                isNotNull(developerApps.oauthClientId),
                sql`(${developerApps.flags} & ${APP_FLAGS.LISTED}) = ${APP_FLAGS.LISTED}`,
            ))
            .orderBy(desc(developerApps.createdAt))
            .limit(100);
    }),
});

/** Disable a client AND delete its issued tokens + consents — deletion is the
 *  real revocation (userinfo ignores `disabled`). Client row kept for audit. */
async function revokeOAuthClient(clientId: string): Promise<void> {
    await db
        .update(oauthApplication)
        .set({ disabled: true, updatedAt: new Date() })
        .where(eq(oauthApplication.clientId, clientId));
    await db.delete(oauthAccessToken).where(eq(oauthAccessToken.clientId, clientId));
    await db.delete(oauthConsent).where(eq(oauthConsent.clientId, clientId));
}
