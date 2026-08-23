import { z } from 'zod';
import { protectedProcedure, publicProcedure, router } from '../trpc';
import { db } from '@/db';
import { user } from '@/db/schema';
import { vipMembers, creatorModerators, welcomeMessageConfig, massMessages, mediaVault, mediaFolders, customEmotes, promoCodes, subscriberBadges } from '@/db/schema/content/creator';
import { follows } from '@/db/schema/content/follow';
import { eq, and, desc, count } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { logModAction } from "@/server/lib/mod-log";

export const creatorRouter = router({

    // ─── VIP Members ─────────────────────────────────────────────────────────

    getVIPs: publicProcedure
        .input(z.object({ creatorId: z.string() }))
        .query(async ({ input }) => {
            const rows = await db
                .select({ id: user.id, name: user.name, username: user.username, avatar_url: user.avatar_url, addedAt: vipMembers.createdAt, note: vipMembers.note })
                .from(vipMembers)
                .innerJoin(user, eq(vipMembers.memberId, user.id))
                .where(eq(vipMembers.creatorId, input.creatorId))
                .orderBy(desc(vipMembers.createdAt));
            return rows;
        }),

    isVIP: publicProcedure
        .input(z.object({ creatorId: z.string(), memberId: z.string() }))
        .query(async ({ input }) => {
            const row = await db.select({ id: vipMembers.id }).from(vipMembers)
                .where(and(eq(vipMembers.creatorId, input.creatorId), eq(vipMembers.memberId, input.memberId)))
                .limit(1);
            return { isVIP: row.length > 0 };
        }),

    addVIP: protectedProcedure
        .input(z.object({ memberId: z.string(), note: z.string().max(200).optional() }))
        .mutation(async ({ ctx, input }) => {
            if (ctx.user.id === input.memberId) throw new Error("Cannot add yourself as VIP");
            const existing = await db.select({ id: vipMembers.id }).from(vipMembers).where(and(eq(vipMembers.creatorId, ctx.user.id), eq(vipMembers.memberId, input.memberId))).limit(1);
            if (existing.length >= 100) throw new Error("VIP limit reached (100)");
            await db.insert(vipMembers).values({ id: nanoid(), creatorId: ctx.user.id, memberId: input.memberId, note: input.note }).onConflictDoNothing();
            await logModAction({ creatorId: ctx.user.id, actorId: ctx.user.id, targetUserId: input.memberId, action: "vip_add", detail: input.note });
            return { success: true };
        }),

    removeVIP: protectedProcedure
        .input(z.object({ memberId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await db.delete(vipMembers).where(and(eq(vipMembers.creatorId, ctx.user.id), eq(vipMembers.memberId, input.memberId)));
            await logModAction({ creatorId: ctx.user.id, actorId: ctx.user.id, targetUserId: input.memberId, action: "vip_remove" });
            return { success: true };
        }),

    // ─── Moderators ──────────────────────────────────────────────────────────

    getModerators: publicProcedure
        .input(z.object({ creatorId: z.string() }))
        .query(async ({ input }) => {
            const rows = await db
                .select({ id: user.id, name: user.name, username: user.username, avatar_url: user.avatar_url, addedAt: creatorModerators.createdAt })
                .from(creatorModerators)
                .innerJoin(user, eq(creatorModerators.moderatorId, user.id))
                .where(eq(creatorModerators.creatorId, input.creatorId))
                .orderBy(desc(creatorModerators.createdAt));
            return rows;
        }),

    isModerator: publicProcedure
        .input(z.object({ creatorId: z.string(), userId: z.string() }))
        .query(async ({ input }) => {
            const row = await db.select({ id: creatorModerators.id }).from(creatorModerators)
                .where(and(eq(creatorModerators.creatorId, input.creatorId), eq(creatorModerators.moderatorId, input.userId)))
                .limit(1);
            return { isModerator: row.length > 0 };
        }),

    addModerator: protectedProcedure
        .input(z.object({ moderatorId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            if (ctx.user.id === input.moderatorId) throw new Error("Cannot add yourself as moderator");
            await db.insert(creatorModerators).values({ id: nanoid(), creatorId: ctx.user.id, moderatorId: input.moderatorId }).onConflictDoNothing();
            await logModAction({ creatorId: ctx.user.id, actorId: ctx.user.id, targetUserId: input.moderatorId, action: "mod_add" });
            return { success: true };
        }),

    removeModerator: protectedProcedure
        .input(z.object({ moderatorId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await db.delete(creatorModerators).where(and(eq(creatorModerators.creatorId, ctx.user.id), eq(creatorModerators.moderatorId, input.moderatorId)));
            await logModAction({ creatorId: ctx.user.id, actorId: ctx.user.id, targetUserId: input.moderatorId, action: "mod_remove" });
            return { success: true };
        }),

    // ─── Welcome Message ─────────────────────────────────────────────────────

    getWelcomeMessage: protectedProcedure.query(async ({ ctx }) => {
        const row = await db.select().from(welcomeMessageConfig).where(eq(welcomeMessageConfig.userId, ctx.user.id)).limit(1);
        return row[0] ?? null;
    }),

    setWelcomeMessage: protectedProcedure
        .input(z.object({ enabled: z.boolean(), message: z.string().max(1000) }))
        .mutation(async ({ ctx, input }) => {
            await db.insert(welcomeMessageConfig).values({ id: nanoid(), userId: ctx.user.id, enabled: input.enabled, message: input.message })
                .onConflictDoUpdate({ target: welcomeMessageConfig.userId, set: { enabled: input.enabled, message: input.message } });
            return { success: true };
        }),

    // ─── Mass Messages ────────────────────────────────────────────────────────

    getMassMessages: protectedProcedure.query(async ({ ctx }) => {
        return db.select().from(massMessages).where(eq(massMessages.senderId, ctx.user.id)).orderBy(desc(massMessages.createdAt)).limit(50);
    }),

    sendMassMessage: protectedProcedure
        .input(z.object({
            content: z.string().min(1).max(2000),
            mediaUrl: z.string().url().optional(),
            audience: z.enum(["all_followers", "vips"]),
        }))
        .mutation(async ({ ctx, input }) => {
            // Count recipients
            let recipientCount = 0;
            if (input.audience === "all_followers") {
                const [r] = await db.select({ count: count() }).from(follows).where(eq(follows.followingId, ctx.user.id));
                recipientCount = r?.count ?? 0;
            } else {
                const [r] = await db.select({ count: count() }).from(vipMembers).where(eq(vipMembers.creatorId, ctx.user.id));
                recipientCount = r?.count ?? 0;
            }
            const id = nanoid();
            await db.insert(massMessages).values({ id, senderId: ctx.user.id, content: input.content, mediaUrl: input.mediaUrl, audience: input.audience, recipientCount, status: "sent", sentAt: new Date() });
            return { id, recipientCount };
        }),

    // ─── Media Vault ──────────────────────────────────────────────────────────

    getVaultFolders: protectedProcedure.query(async ({ ctx }) => {
        return db.select().from(mediaFolders).where(eq(mediaFolders.userId, ctx.user.id)).orderBy(mediaFolders.name);
    }),

    createVaultFolder: protectedProcedure
        .input(z.object({ name: z.string().min(1).max(100) }))
        .mutation(async ({ ctx, input }) => {
            const id = nanoid();
            await db.insert(mediaFolders).values({ id, userId: ctx.user.id, name: input.name });
            return { id };
        }),

    deleteVaultFolder: protectedProcedure
        .input(z.object({ folderId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await db.delete(mediaFolders).where(and(eq(mediaFolders.id, input.folderId), eq(mediaFolders.userId, ctx.user.id)));
            return { success: true };
        }),

    getVaultMedia: protectedProcedure
        .input(z.object({ folderId: z.string().optional(), type: z.enum(["image", "video", "audio"]).optional(), favoritesOnly: z.boolean().optional(), cursor: z.string().optional(), limit: z.number().min(1).max(100).default(30) }))
        .query(async ({ ctx, input }) => {
            const conditions = [eq(mediaVault.userId, ctx.user.id)];
            if (input.folderId) conditions.push(eq(mediaVault.folderId, input.folderId));
            if (input.type) conditions.push(eq(mediaVault.type, input.type));
            if (input.favoritesOnly) conditions.push(eq(mediaVault.isFavorite, true));

            const rows = await db.select().from(mediaVault).where(and(...conditions)).orderBy(desc(mediaVault.createdAt)).limit(input.limit + 1);
            const hasMore = rows.length > input.limit;
            return { items: hasMore ? rows.slice(0, input.limit) : rows, hasMore };
        }),

    addVaultMedia: protectedProcedure
        .input(z.object({ url: z.string().url(), thumbnailUrl: z.string().url().optional(), type: z.enum(["image", "video", "audio"]), name: z.string().optional(), size: z.number().optional(), mimeType: z.string().optional(), folderId: z.string().optional() }))
        .mutation(async ({ ctx, input }) => {
            const id = nanoid();
            await db.insert(mediaVault).values({ id, userId: ctx.user.id, ...input });
            return { id };
        }),

    toggleVaultFavorite: protectedProcedure
        .input(z.object({ mediaId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const row = await db.select({ isFavorite: mediaVault.isFavorite }).from(mediaVault).where(and(eq(mediaVault.id, input.mediaId), eq(mediaVault.userId, ctx.user.id))).limit(1);
            if (!row[0]) throw new Error("Not found");
            await db.update(mediaVault).set({ isFavorite: !row[0].isFavorite }).where(eq(mediaVault.id, input.mediaId));
            return { isFavorite: !row[0].isFavorite };
        }),

    deleteVaultMedia: protectedProcedure
        .input(z.object({ mediaId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await db.delete(mediaVault).where(and(eq(mediaVault.id, input.mediaId), eq(mediaVault.userId, ctx.user.id)));
            return { success: true };
        }),

    moveVaultMedia: protectedProcedure
        .input(z.object({ mediaId: z.string(), folderId: z.string().nullable() }))
        .mutation(async ({ ctx, input }) => {
            await db.update(mediaVault).set({ folderId: input.folderId }).where(and(eq(mediaVault.id, input.mediaId), eq(mediaVault.userId, ctx.user.id)));
            return { success: true };
        }),

    // ─── Custom Emotes ────────────────────────────────────────────────────────

    getEmotes: publicProcedure
        .input(z.object({ creatorId: z.string() }))
        .query(async ({ input }) => {
            return db.select().from(customEmotes).where(eq(customEmotes.creatorId, input.creatorId)).orderBy(customEmotes.name);
        }),

    addEmote: protectedProcedure
        .input(z.object({ name: z.string().min(1).max(32).regex(/^[a-z0-9_]+$/), imageUrl: z.string().url() }))
        .mutation(async ({ ctx, input }) => {
            const id = nanoid();
            await db.insert(customEmotes).values({ id, creatorId: ctx.user.id, name: input.name, imageUrl: input.imageUrl });
            return { id };
        }),

    deleteEmote: protectedProcedure
        .input(z.object({ emoteId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await db.delete(customEmotes).where(and(eq(customEmotes.id, input.emoteId), eq(customEmotes.creatorId, ctx.user.id)));
            return { success: true };
        }),

    // ─── Promo Codes ─────────────────────────────────────────────────────────

    getMyCodes: protectedProcedure.query(async ({ ctx }) => {
        return db.select().from(promoCodes)
            .where(eq(promoCodes.creatorId, ctx.user.id))
            .orderBy(desc(promoCodes.createdAt));
    }),

    createCode: protectedProcedure
        .input(z.object({
            code: z.string().min(3).max(20).regex(/^[A-Z0-9_]+$/i),
            discountPercent: z.number().min(1).max(100),
            maxUses: z.number().min(1).optional(),
            expiresAt: z.date().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const id = nanoid();
            await db.insert(promoCodes).values({
                id, creatorId: ctx.user.id,
                code: input.code.toUpperCase(),
                discountPercent: input.discountPercent,
                maxUses: input.maxUses,
                expiresAt: input.expiresAt,
            });
            return { id };
        }),

    toggleCode: protectedProcedure
        .input(z.object({ codeId: z.string(), isActive: z.boolean() }))
        .mutation(async ({ ctx, input }) => {
            await db.update(promoCodes).set({ isActive: input.isActive })
                .where(and(eq(promoCodes.id, input.codeId), eq(promoCodes.creatorId, ctx.user.id)));
            return { success: true };
        }),

    deleteCode: protectedProcedure
        .input(z.object({ codeId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await db.delete(promoCodes).where(and(eq(promoCodes.id, input.codeId), eq(promoCodes.creatorId, ctx.user.id)));
            return { success: true };
        }),

    // ─── Subscriber Badges ────────────────────────────────────────────────────

    getMyFollowerBadges: protectedProcedure.query(async ({ ctx }) => {
        // Return badges for people who follow me, ordered by follow duration
        return db.select({
            id: subscriberBadges.id,
            subscriberId: subscriberBadges.subscriberId,
            followMonths: subscriberBadges.followMonths,
            tier: subscriberBadges.tier,
            awardedAt: subscriberBadges.awardedAt,
            name: user.name,
            username: user.username,
            avatar_url: user.avatar_url,
        }).from(subscriberBadges)
            .innerJoin(user, eq(subscriberBadges.subscriberId, user.id))
            .where(eq(subscriberBadges.creatorId, ctx.user.id))
            .orderBy(desc(subscriberBadges.followMonths))
            .limit(100);
    }),

    getMyBadges: protectedProcedure.query(async ({ ctx }) => {
        // Return badges I've earned from creators I follow
        return db.select({
            id: subscriberBadges.id,
            creatorId: subscriberBadges.creatorId,
            followMonths: subscriberBadges.followMonths,
            tier: subscriberBadges.tier,
            awardedAt: subscriberBadges.awardedAt,
            name: user.name,
            username: user.username,
            avatar_url: user.avatar_url,
        }).from(subscriberBadges)
            .innerJoin(user, eq(subscriberBadges.creatorId, user.id))
            .where(eq(subscriberBadges.subscriberId, ctx.user.id))
            .orderBy(desc(subscriberBadges.followMonths));
    }),
});
