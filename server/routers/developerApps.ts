import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/db";
import { developerApps } from "@/db/schema/content/developer-app";
import { developerBots } from "@/db/schema/content/developer-bot";
import { user } from "@/db/schema/auth/user";
import { randHex } from "@/lib/api-gate";
import { generateAppKeypair } from "@/lib/developer/app-keys";
import { computeVerification } from "@/lib/developer/verification";
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
};

// Public shape — deliberately omits privateKeyEnc.
const publicCols = {
    id: developerApps.id,
    name: developerApps.name,
    description: developerApps.description,
    iconUrl: developerApps.iconUrl,
    tags: developerApps.tags,
    publicKey: developerApps.publicKey,
    tosUrl: developerApps.tosUrl,
    privacyUrl: developerApps.privacyUrl,
    createdAt: developerApps.createdAt,
    updatedAt: developerApps.updatedAt,
};

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
                .returning({ id: developerApps.id });
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
            return { success: true };
        }),
});
