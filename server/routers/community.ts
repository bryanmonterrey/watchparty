import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "@/server/trpc";
import { db } from "@/db";
import {
    communityServers,
    communityMembers,
    communityChannels,
    communityMessages,
    communityChannelReads,
    communityMessageReactions,
    communityServerBoosts,
    communityBoostGrants,
    communityBans,
    communityAuditLog,
    communityExpressions,
} from "@/db/schema/community";
import { user } from "@/db/schema";
import { premiumSubscriptions } from "@/db/schema/content";
import { TIERS, USDC_MINT, type TierKey } from "@/lib/premium/tiers";
import { BOOST_PACKS, getBoostTreasuryOwner } from "@/lib/premium/boosts";
import { getRpcUrl } from "@/lib/chains/solana/subscriptions/constants";
import { eq, and, desc, asc, sql, lt, ne, count, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { publishToRoom } from "@/lib/realtime/publish";
import { rooms } from "@/lib/realtime/protocol";

// In-memory OG unfurl cache (per isolate). Small + TTL'd; misses just refetch.
type LinkPreviewData = { title: string | null; description: string | null; image: string | null; siteName: string | null };
const linkPreviewCache = new Map<string, { data: LinkPreviewData | null; exp: number }>();

const decodeEntities = (s: string) =>
    s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#x27;/gi, "'");

/** meta by property/name, tolerant of attribute order */
function metaContent(html: string, key: string): string | null {
    const re = new RegExp(
        `<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`,
        "i",
    );
    const m = html.match(re);
    const raw = m?.[1] ?? m?.[2];
    return raw ? decodeEntities(raw).trim() || null : null;
}

/** Reject URLs that could reach internal services (SSRF guard). */
function isPublicHttpUrl(u: URL): boolean {
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
    if (host.includes(":") || host.startsWith("[")) return false; // IPv6 literal
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false; // IPv4 literal
    return true;
}

/** Fire-and-forget audit trail entry — management actions only, never chat. */
function logAudit(serverId: string, actorUserId: string, action: string, detail?: string) {
    return db.insert(communityAuditLog).values({ serverId, actorUserId, action, detail }).catch(() => {});
}

/** Comma-separated automod keywords → normalized list. */
function parseKeywords(raw: string | null | undefined): string[] {
    return (raw ?? "")
        .split(",")
        .map((w) => w.trim().toLowerCase())
        .filter(Boolean);
}

/**
 * Boost allowance for a user: slots from their active premium tier (computed
 * live — lapse and they're gone) + purchased packs (permanent) − boosts in use.
 */
async function boostAllowance(userId: string) {
    const [sub] = await db
        .select({ tierKey: premiumSubscriptions.tierKey, status: premiumSubscriptions.status, currentPeriodEnd: premiumSubscriptions.currentPeriodEnd })
        .from(premiumSubscriptions)
        .where(eq(premiumSubscriptions.userId, userId))
        .limit(1);
    const tierActive =
        !!sub &&
        (sub.status === "active" || sub.status === "past_due") &&
        sub.currentPeriodEnd.getTime() > Date.now();
    const tierSlots = tierActive ? (TIERS[sub.tierKey as TierKey]?.boostSlots ?? 0) : 0;

    const [grantRow] = await db
        .select({ purchased: sql<number>`COALESCE(SUM(${communityBoostGrants.amount}), 0)` })
        .from(communityBoostGrants)
        .where(eq(communityBoostGrants.userId, userId));
    const purchased = Number(grantRow?.purchased ?? 0);

    const [usedRow] = await db
        .select({ used: count() })
        .from(communityServerBoosts)
        .innerJoin(communityMembers, eq(communityServerBoosts.memberId, communityMembers.id))
        .where(eq(communityMembers.userId, userId));
    const used = Number(usedRow?.used ?? 0);

    return { tierSlots, purchased, used, available: tierSlots + purchased - used };
}

/**
 * Post a system row (join/boost announcements) into the server's system
 * channel (falls back to #general, then the first channel). Fire-and-forget:
 * a failed announcement never fails the action that triggered it.
 */
async function sendSystemMessage(serverId: string, memberId: string, content: string) {
    try {
        const [srv] = await db
            .select({ systemChannelId: communityServers.systemChannelId })
            .from(communityServers)
            .where(eq(communityServers.id, serverId))
            .limit(1);
        const channels = await db
            .select({ id: communityChannels.id, name: communityChannels.name, type: communityChannels.type })
            .from(communityChannels)
            .where(eq(communityChannels.serverId, serverId));
        const target =
            channels.find((c) => c.id === srv?.systemChannelId) ??
            channels.find((c) => c.name === "general" && c.type === "TEXT") ??
            channels.find((c) => c.type === "TEXT");
        if (!target) return;
        await db.insert(communityMessages).values({
            content,
            memberId,
            channelId: target.id,
            system: true,
        });
        await notifyChannelChange(target.id);
    } catch {
        // announcements are best-effort
    }
}

const WELCOME_TEMPLATES = [
    "{name} just landed",
    "Say hi to {name}",
    "{name} is here",
    "{name} joined the server",
];

/** Notify connected clients that a channel's messages changed → they refetch. */
function notifyChannelChange(channelId: string) {
    return publishToRoom(rooms.communityChannel(channelId), {
        t: "event",
        name: "message-change",
        payload: null,
    });
}

export const communityRouter = router({
    // ─── Server CRUD ─────────────────────────────────────

    /** List servers the current user belongs to */
    listServers: protectedProcedure.query(async ({ ctx }) => {
        const servers = await db
            .select({
                id: communityServers.id,
                name: communityServers.name,
                imageUrl: communityServers.imageUrl,
                inviteCode: communityServers.inviteCode,
                ownerId: communityServers.ownerId,
                createdAt: communityServers.createdAt,
                muted: communityMembers.muted,
            })
            .from(communityServers)
            .innerJoin(communityMembers, eq(communityServers.id, communityMembers.serverId))
            .where(eq(communityMembers.userId, ctx.user.id))
            .orderBy(sql`${communityMembers.railPosition} ASC NULLS LAST`, asc(communityServers.createdAt));

        // Unread flag per server: any channel message newer than the member's
        // read marker (missing marker = everything unread), not their own.
        const unreadServers = await db
            .selectDistinct({ serverId: communityChannels.serverId })
            .from(communityMessages)
            .innerJoin(communityChannels, eq(communityMessages.channelId, communityChannels.id))
            .innerJoin(communityMembers, and(
                eq(communityMembers.serverId, communityChannels.serverId),
                eq(communityMembers.userId, ctx.user.id),
            ))
            .leftJoin(communityChannelReads, and(
                eq(communityChannelReads.channelId, communityChannels.id),
                eq(communityChannelReads.memberId, communityMembers.id),
            ))
            .where(and(
                ne(communityMessages.memberId, communityMembers.id),
                eq(communityMessages.deleted, false),
                sql`${communityMessages.createdAt} > COALESCE(${communityChannelReads.lastReadAt}, 'epoch'::timestamptz)`,
            ));
        const unreadSet = new Set(unreadServers.map((r) => r.serverId));

        // Mention counts: unread messages containing @myusername, per server.
        const [me] = await db.select({ username: user.username }).from(user).where(eq(user.id, ctx.user.id)).limit(1);
        let mentionMap = new Map<string, number>();
        if (me?.username) {
            const mentionRows = await db
                .select({ serverId: communityChannels.serverId, cnt: count() })
                .from(communityMessages)
                .innerJoin(communityChannels, eq(communityMessages.channelId, communityChannels.id))
                .innerJoin(communityMembers, and(
                    eq(communityMembers.serverId, communityChannels.serverId),
                    eq(communityMembers.userId, ctx.user.id),
                ))
                .leftJoin(communityChannelReads, and(
                    eq(communityChannelReads.channelId, communityChannels.id),
                    eq(communityChannelReads.memberId, communityMembers.id),
                ))
                .where(and(
                    ne(communityMessages.memberId, communityMembers.id),
                    eq(communityMessages.deleted, false),
                    sql`${communityMessages.createdAt} > COALESCE(${communityChannelReads.lastReadAt}, 'epoch'::timestamptz)`,
                    sql`${communityMessages.content} ILIKE ${'%@' + me.username + '%'}`,
                ))
                .groupBy(communityChannels.serverId);
            mentionMap = new Map(mentionRows.map((r) => [r.serverId, Number(r.cnt)]));
        }

        // Muted servers stay quiet on the rail: no unread pill; mentions still show.
        return servers.map((s) => ({
            ...s,
            hasUnread: !s.muted && unreadSet.has(s.id),
            mentionCount: mentionMap.get(s.id) ?? 0,
        }));
    }),

    /** Quick switcher: every channel across the user's servers + unread counts */
    quickSwitch: protectedProcedure.query(async ({ ctx }) => {
        const rows = await db
            .select({
                channelId: communityChannels.id,
                channelName: communityChannels.name,
                channelType: communityChannels.type,
                serverId: communityServers.id,
                serverName: communityServers.name,
                serverImage: communityServers.imageUrl,
                position: communityChannels.position,
                createdAt: communityChannels.createdAt,
            })
            .from(communityChannels)
            .innerJoin(communityServers, eq(communityChannels.serverId, communityServers.id))
            .innerJoin(communityMembers, and(
                eq(communityMembers.serverId, communityServers.id),
                eq(communityMembers.userId, ctx.user.id),
            ))
            .orderBy(asc(communityServers.createdAt), sql`${communityChannels.position} ASC NULLS LAST`, asc(communityChannels.createdAt));

        const unread = await db
            .select({ channelId: communityMessages.channelId, cnt: count() })
            .from(communityMessages)
            .innerJoin(communityChannels, eq(communityMessages.channelId, communityChannels.id))
            .innerJoin(communityMembers, and(
                eq(communityMembers.serverId, communityChannels.serverId),
                eq(communityMembers.userId, ctx.user.id),
            ))
            .leftJoin(communityChannelReads, and(
                eq(communityChannelReads.channelId, communityChannels.id),
                eq(communityChannelReads.memberId, communityMembers.id),
            ))
            .where(and(
                ne(communityMessages.memberId, communityMembers.id),
                eq(communityMessages.deleted, false),
                sql`${communityMessages.createdAt} > COALESCE(${communityChannelReads.lastReadAt}, 'epoch'::timestamptz)`,
            ))
            .groupBy(communityMessages.channelId);
        const unreadMap = new Map(unread.map((r) => [r.channelId, Number(r.cnt)]));

        return rows.map((r) => ({
            channelId: r.channelId,
            channelName: r.channelName,
            channelType: r.channelType,
            serverId: r.serverId,
            serverName: r.serverName,
            serverImage: r.serverImage,
            unreadCount: unreadMap.get(r.channelId) ?? 0,
        }));
    }),

    /** Get a server by ID with channels + members */
    getServer: protectedProcedure
        .input(z.object({ serverId: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            // Verify membership
            const membership = await db
                .select()
                .from(communityMembers)
                .where(
                    and(
                        eq(communityMembers.serverId, input.serverId),
                        eq(communityMembers.userId, ctx.user.id)
                    )
                )
                .limit(1);

            if (!membership.length) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this server" });
            }

            const server = await db
                .select()
                .from(communityServers)
                .where(eq(communityServers.id, input.serverId))
                .limit(1);

            if (!server.length) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });
            }

            const channels = await db
                .select()
                .from(communityChannels)
                .where(eq(communityChannels.serverId, input.serverId))
                .orderBy(sql`${communityChannels.position} ASC NULLS LAST`, asc(communityChannels.createdAt));

            // Unread count per channel for the current member.
            const unreadRows = await db
                .select({ channelId: communityMessages.channelId, cnt: count() })
                .from(communityMessages)
                .innerJoin(communityChannels, eq(communityMessages.channelId, communityChannels.id))
                .leftJoin(communityChannelReads, and(
                    eq(communityChannelReads.channelId, communityMessages.channelId),
                    eq(communityChannelReads.memberId, membership[0].id),
                ))
                .where(and(
                    eq(communityChannels.serverId, input.serverId),
                    ne(communityMessages.memberId, membership[0].id),
                    eq(communityMessages.deleted, false),
                    sql`${communityMessages.createdAt} > COALESCE(${communityChannelReads.lastReadAt}, 'epoch'::timestamptz)`,
                ))
                .groupBy(communityMessages.channelId);
            const unreadByChannel = new Map(unreadRows.map((r) => [r.channelId, Number(r.cnt)]));
            const channelsWithUnread = channels.map((c) => ({ ...c, unreadCount: unreadByChannel.get(c.id) ?? 0 }));

            const members = await db
                .select({
                    id: communityMembers.id,
                    role: communityMembers.role,
                    userId: communityMembers.userId,
                    serverId: communityMembers.serverId,
                    createdAt: communityMembers.createdAt,
                    userName: sql<string>`COALESCE(${communityMembers.nickname}, ${user.name})`,
                    userImage: user.avatar_url,
                    userUsername: user.username,
                    nickname: communityMembers.nickname,
                })
                .from(communityMembers)
                .innerJoin(user, eq(communityMembers.userId, user.id))
                .where(eq(communityMembers.serverId, input.serverId))
                .orderBy(asc(communityMembers.role));

            const boosts = await db
                .select({ memberId: communityServerBoosts.memberId })
                .from(communityServerBoosts)
                .where(eq(communityServerBoosts.serverId, input.serverId));

            return {
                server: server[0],
                channels: channelsWithUnread,
                members,
                currentMember: membership[0],
                boostCount: boosts.length,
                boostedByMe: boosts.some((b) => b.memberId === membership[0].id),
            };
        }),

    /** Create a new server */
    createServer: protectedProcedure
        .input(
            z.object({
                name: z.string().min(1).max(100),
                imageUrl: z.string().optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const inviteCode = nanoid(8);

            const [newServer] = await db
                .insert(communityServers)
                .values({
                    name: input.name,
                    imageUrl: input.imageUrl ?? null,
                    inviteCode,
                    ownerId: ctx.user.id,
                })
                .returning();

            // Add owner as ADMIN member
            await db.insert(communityMembers).values({
                userId: ctx.user.id,
                serverId: newServer.id,
                role: "ADMIN",
            });

            // Create default #general channel
            await db.insert(communityChannels).values({
                name: "general",
                type: "TEXT",
                serverId: newServer.id,
                createdById: ctx.user.id,
            });

            return newServer;
        }),

    /** Update server */
    updateServer: protectedProcedure
        .input(
            z.object({
                serverId: z.string().uuid(),
                name: z.string().min(1).max(100).optional(),
                imageUrl: z.string().optional(),
                tag: z.string().max(8).nullable().optional(),
                automodKeywords: z.string().max(2000).nullable().optional(),
                bannerColor: z.string().max(64).nullable().optional(),
                description: z.string().max(500).nullable().optional(),
                traits: z.string().max(300).nullable().optional(),
                privateProfile: z.boolean().optional(),
                systemChannelId: z.string().uuid().nullable().optional(),
                welcomeMessages: z.boolean().optional(),
                boostMessages: z.boolean().optional(),
                automodBlockLinks: z.boolean().optional(),
                automodBlockMentions: z.boolean().optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN");

            const [updated] = await db
                .update(communityServers)
                .set({
                    ...(input.name && { name: input.name }),
                    ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
                    ...(input.tag !== undefined && { tag: input.tag ? input.tag.trim().toUpperCase() : null }),
                    ...(input.automodKeywords !== undefined && { automodKeywords: input.automodKeywords }),
                    ...(input.bannerColor !== undefined && { bannerColor: input.bannerColor }),
                    ...(input.description !== undefined && { description: input.description?.trim() || null }),
                    ...(input.traits !== undefined && { traits: input.traits }),
                    ...(input.privateProfile !== undefined && { privateProfile: input.privateProfile }),
                    ...(input.systemChannelId !== undefined && { systemChannelId: input.systemChannelId }),
                    ...(input.welcomeMessages !== undefined && { welcomeMessages: input.welcomeMessages }),
                    ...(input.boostMessages !== undefined && { boostMessages: input.boostMessages }),
                    ...(input.automodBlockLinks !== undefined && { automodBlockLinks: input.automodBlockLinks }),
                    ...(input.automodBlockMentions !== undefined && { automodBlockMentions: input.automodBlockMentions }),
                    updatedAt: new Date(),
                })
                .where(eq(communityServers.id, input.serverId))
                .returning();

            await logAudit(input.serverId, ctx.user.id, "server.update", "updated server settings");
            return updated;
        }),

    /** Delete server */
    deleteServer: protectedProcedure
        .input(z.object({ serverId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN");

            await db.delete(communityServers).where(eq(communityServers.id, input.serverId));
            return { success: true };
        }),

    /** Generate new invite code */
    generateInviteCode: protectedProcedure
        .input(z.object({ serverId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN", "MODERATOR");

            const newCode = nanoid(8);
            const [updated] = await db
                .update(communityServers)
                .set({ inviteCode: newCode, updatedAt: new Date() })
                .where(eq(communityServers.id, input.serverId))
                .returning();

            await logAudit(input.serverId, ctx.user.id, "invite.regenerate", "regenerated the invite link");
            return { inviteCode: updated.inviteCode };
        }),

    /** Invite-link landing data. Private profiles reveal only name + icon. */
    getInvitePreview: protectedProcedure
        .input(z.object({ inviteCode: z.string().min(1) }))
        .query(async ({ ctx, input }) => {
            const [server] = await db
                .select()
                .from(communityServers)
                .where(eq(communityServers.inviteCode, input.inviteCode))
                .limit(1);
            if (!server) throw new TRPCError({ code: "NOT_FOUND", message: "This invite is invalid or expired" });

            const [member] = await db
                .select({ id: communityMembers.id })
                .from(communityMembers)
                .where(and(eq(communityMembers.serverId, server.id), eq(communityMembers.userId, ctx.user.id)))
                .limit(1);

            const [{ n: memberCount }] = await db
                .select({ n: count() })
                .from(communityMembers)
                .where(eq(communityMembers.serverId, server.id));

            const isPrivate = !!server.privateProfile && !member;
            return {
                serverId: member ? server.id : null,
                alreadyMember: !!member,
                invitesPaused: !!server.invitesPaused,
                name: server.name,
                imageUrl: server.imageUrl,
                tag: isPrivate ? null : server.tag,
                bannerColor: isPrivate ? null : server.bannerColor,
                description: isPrivate ? null : server.description,
                traits: isPrivate ? null : server.traits,
                memberCount: isPrivate ? null : Number(memberCount),
                createdAt: isPrivate ? null : server.createdAt,
                privateProfile: isPrivate,
            };
        }),

    /** Join a server via invite code */
    joinServer: protectedProcedure
        .input(z.object({ inviteCode: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const server = await db
                .select()
                .from(communityServers)
                .where(eq(communityServers.inviteCode, input.inviteCode))
                .limit(1);

            if (!server.length) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Invalid invite code" });
            }

            // Check if already a member
            const existing = await db
                .select()
                .from(communityMembers)
                .where(
                    and(
                        eq(communityMembers.serverId, server[0].id),
                        eq(communityMembers.userId, ctx.user.id)
                    )
                )
                .limit(1);

            if (existing.length) {
                return { serverId: server[0].id, alreadyMember: true };
            }

            const banned = await db
                .select({ id: communityBans.id })
                .from(communityBans)
                .where(and(eq(communityBans.serverId, server[0].id), eq(communityBans.userId, ctx.user.id)))
                .limit(1);
            if (banned.length) {
                throw new TRPCError({ code: "FORBIDDEN", message: "You are banned from this server" });
            }

            if (server[0].invitesPaused) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Invites are paused on this server" });
            }

            const [newMember] = await db
                .insert(communityMembers)
                .values({
                    userId: ctx.user.id,
                    serverId: server[0].id,
                    role: "GUEST",
                })
                .returning();

            // Welcome announcement (on unless explicitly disabled)
            if (server[0].welcomeMessages !== false && newMember) {
                const [u] = await db.select({ name: user.name }).from(user).where(eq(user.id, ctx.user.id)).limit(1);
                const template = WELCOME_TEMPLATES[Math.floor(Math.random() * WELCOME_TEMPLATES.length)];
                await sendSystemMessage(server[0].id, newMember.id, template.replace("{name}", u?.name ?? "Someone"));
            }

            return { serverId: server[0].id, alreadyMember: false };
        }),

    /** Leave a server */
    leaveServer: protectedProcedure
        .input(z.object({ serverId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            const server = await db
                .select()
                .from(communityServers)
                .where(eq(communityServers.id, input.serverId))
                .limit(1);

            if (server.length && server[0].ownerId === ctx.user.id) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Owner cannot leave the server" });
            }

            await db
                .delete(communityMembers)
                .where(
                    and(
                        eq(communityMembers.serverId, input.serverId),
                        eq(communityMembers.userId, ctx.user.id)
                    )
                );

            return { success: true };
        }),

    /** Update member role */
    updateMemberRole: protectedProcedure
        .input(
            z.object({
                serverId: z.string().uuid(),
                memberId: z.string().uuid(),
                role: z.enum(["ADMIN", "MODERATOR", "GUEST"]),
            })
        )
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN");

            const [updated] = await db
                .update(communityMembers)
                .set({ role: input.role, updatedAt: new Date() })
                .where(eq(communityMembers.id, input.memberId))
                .returning();

            if (updated) {
                const [u] = await db.select({ name: user.name }).from(user).where(eq(user.id, updated.userId)).limit(1);
                await logAudit(input.serverId, ctx.user.id, "member.role", `made ${u?.name ?? "a member"} ${input.role.toLowerCase()}`);
            }
            return updated;
        }),

    /** Kick member */
    kickMember: protectedProcedure
        .input(
            z.object({
                serverId: z.string().uuid(),
                memberId: z.string().uuid(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN");

            // Prevent kicking yourself
            const target = await db
                .select()
                .from(communityMembers)
                .where(eq(communityMembers.id, input.memberId))
                .limit(1);

            if (target.length && target[0].userId === ctx.user.id) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot kick yourself" });
            }

            await db.delete(communityMembers).where(eq(communityMembers.id, input.memberId));
            if (target.length) {
                const [u] = await db.select({ name: user.name }).from(user).where(eq(user.id, target[0].userId)).limit(1);
                await logAudit(input.serverId, ctx.user.id, "member.kick", `kicked ${u?.name ?? "a member"}`);
            }
            return { success: true };
        }),

    /** Ban a member (admin): removes them AND blocks rejoining via invite */
    banMember: protectedProcedure
        .input(
            z.object({
                serverId: z.string().uuid(),
                memberId: z.string().uuid(),
                reason: z.string().max(300).optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN");

            const [target] = await db
                .select()
                .from(communityMembers)
                .where(eq(communityMembers.id, input.memberId))
                .limit(1);
            if (!target || target.serverId !== input.serverId) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
            }
            if (target.userId === ctx.user.id) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot ban yourself" });
            }

            await db
                .insert(communityBans)
                .values({ serverId: input.serverId, userId: target.userId, reason: input.reason ?? null, bannedBy: ctx.user.id })
                .onConflictDoNothing();
            await db.delete(communityMembers).where(eq(communityMembers.id, input.memberId));

            const [u] = await db.select({ name: user.name }).from(user).where(eq(user.id, target.userId)).limit(1);
            await logAudit(input.serverId, ctx.user.id, "member.ban", `banned ${u?.name ?? "a member"}${input.reason ? ` — ${input.reason}` : ""}`);
            return { success: true };
        }),

    /** Revoke a ban (admin) */
    unbanMember: protectedProcedure
        .input(z.object({ serverId: z.string().uuid(), userId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN");

            await db
                .delete(communityBans)
                .where(and(eq(communityBans.serverId, input.serverId), eq(communityBans.userId, input.userId)));

            const [u] = await db.select({ name: user.name }).from(user).where(eq(user.id, input.userId)).limit(1);
            await logAudit(input.serverId, ctx.user.id, "member.unban", `revoked the ban on ${u?.name ?? "a user"}`);
            return { success: true };
        }),

    /** Bans list (admin/mod) */
    listBans: protectedProcedure
        .input(z.object({ serverId: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN", "MODERATOR");

            return db
                .select({
                    id: communityBans.id,
                    userId: communityBans.userId,
                    reason: communityBans.reason,
                    createdAt: communityBans.createdAt,
                    userName: user.name,
                    userImage: user.avatar_url,
                    userUsername: user.username,
                })
                .from(communityBans)
                .innerJoin(user, eq(communityBans.userId, user.id))
                .where(eq(communityBans.serverId, input.serverId))
                .orderBy(desc(communityBans.createdAt));
        }),

    /** Audit log (admin/mod): the last 100 management actions */
    getAuditLog: protectedProcedure
        .input(z.object({ serverId: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN", "MODERATOR");

            return db
                .select({
                    id: communityAuditLog.id,
                    action: communityAuditLog.action,
                    detail: communityAuditLog.detail,
                    createdAt: communityAuditLog.createdAt,
                    actorName: user.name,
                    actorImage: user.avatar_url,
                })
                .from(communityAuditLog)
                .innerJoin(user, eq(communityAuditLog.actorUserId, user.id))
                .where(eq(communityAuditLog.serverId, input.serverId))
                .orderBy(desc(communityAuditLog.createdAt))
                .limit(100);
        }),

    /** Engagement stats (admin/mod): activity over the last 7 days */
    getEngagement: protectedProcedure
        .input(z.object({ serverId: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN", "MODERATOR");
            const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

            const [totalMembers] = await db
                .select({ n: count() })
                .from(communityMembers)
                .where(eq(communityMembers.serverId, input.serverId));

            const [newMembers] = await db
                .select({ n: count() })
                .from(communityMembers)
                .where(and(eq(communityMembers.serverId, input.serverId), sql`${communityMembers.createdAt} > ${weekAgo}`));

            const [messages7d] = await db
                .select({ n: count() })
                .from(communityMessages)
                .innerJoin(communityChannels, eq(communityMessages.channelId, communityChannels.id))
                .where(and(
                    eq(communityChannels.serverId, input.serverId),
                    eq(communityMessages.deleted, false),
                    sql`${communityMessages.createdAt} > ${weekAgo}`,
                ));

            const [activeMembers] = await db
                .select({ n: sql<number>`COUNT(DISTINCT ${communityMessages.memberId})` })
                .from(communityMessages)
                .innerJoin(communityChannels, eq(communityMessages.channelId, communityChannels.id))
                .where(and(
                    eq(communityChannels.serverId, input.serverId),
                    eq(communityMessages.deleted, false),
                    sql`${communityMessages.createdAt} > ${weekAgo}`,
                ));

            const topChannels = await db
                .select({
                    channelId: communityChannels.id,
                    name: communityChannels.name,
                    type: communityChannels.type,
                    messages: count(),
                })
                .from(communityMessages)
                .innerJoin(communityChannels, eq(communityMessages.channelId, communityChannels.id))
                .where(and(
                    eq(communityChannels.serverId, input.serverId),
                    eq(communityMessages.deleted, false),
                    sql`${communityMessages.createdAt} > ${weekAgo}`,
                ))
                .groupBy(communityChannels.id, communityChannels.name, communityChannels.type)
                .orderBy(desc(count()))
                .limit(5);

            return {
                totalMembers: Number(totalMembers?.n ?? 0),
                newMembers7d: Number(newMembers?.n ?? 0),
                messages7d: Number(messages7d?.n ?? 0),
                activeMembers7d: Number(activeMembers?.n ?? 0),
                topChannels: topChannels.map((c) => ({ ...c, messages: Number(c.messages) })),
            };
        }),

    /** Pause/resume invites (admin) — joins via link are rejected while paused */
    setInvitesPaused: protectedProcedure
        .input(z.object({ serverId: z.string().uuid(), paused: z.boolean() }))
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN");
            await db
                .update(communityServers)
                .set({ invitesPaused: input.paused, updatedAt: new Date() })
                .where(eq(communityServers.id, input.serverId));
            await logAudit(input.serverId, ctx.user.id, "access.invites", input.paused ? "paused invites" : "resumed invites");
            return { paused: input.paused };
        }),

    // ─── Expressions (custom emoji + stickers) ───────────

    /** All expressions on a server (member) */
    listExpressions: protectedProcedure
        .input(z.object({ serverId: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            const [member] = await db
                .select({ id: communityMembers.id })
                .from(communityMembers)
                .where(and(eq(communityMembers.serverId, input.serverId), eq(communityMembers.userId, ctx.user.id)))
                .limit(1);
            if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member" });

            return db
                .select()
                .from(communityExpressions)
                .where(eq(communityExpressions.serverId, input.serverId))
                .orderBy(asc(communityExpressions.name));
        }),

    /** Add an emoji or sticker (admin/mod) */
    addExpression: protectedProcedure
        .input(
            z.object({
                serverId: z.string().uuid(),
                kind: z.enum(["emoji", "sticker"]),
                name: z.string().min(2).max(32).regex(/^[a-z0-9_]+$/, "Lowercase letters, numbers, and underscores only"),
                imageUrl: z.string().url(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN", "MODERATOR");

            const [created] = await db
                .insert(communityExpressions)
                .values({
                    serverId: input.serverId,
                    kind: input.kind,
                    name: input.name,
                    imageUrl: input.imageUrl,
                    createdBy: ctx.user.id,
                })
                .onConflictDoNothing()
                .returning();
            if (!created) throw new TRPCError({ code: "CONFLICT", message: `A ${input.kind} named :${input.name}: already exists` });

            await logAudit(input.serverId, ctx.user.id, "expression.add", `added ${input.kind} :${input.name}:`);
            return created;
        }),

    /** Remove an emoji or sticker (admin/mod) */
    deleteExpression: protectedProcedure
        .input(z.object({ serverId: z.string().uuid(), expressionId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN", "MODERATOR");

            const [removed] = await db
                .delete(communityExpressions)
                .where(and(eq(communityExpressions.id, input.expressionId), eq(communityExpressions.serverId, input.serverId)))
                .returning();
            if (removed) {
                await logAudit(input.serverId, ctx.user.id, "expression.delete", `removed ${removed.kind} :${removed.name}:`);
            }
            return { success: true };
        }),

    /** Per-server nickname ("per-server profile"); null clears it */
    setNickname: protectedProcedure
        .input(z.object({ serverId: z.string().uuid(), nickname: z.string().max(50).nullable() }))
        .mutation(async ({ ctx, input }) => {
            const [updated] = await db
                .update(communityMembers)
                .set({ nickname: input.nickname?.trim() || null, updatedAt: new Date() })
                .where(and(eq(communityMembers.serverId, input.serverId), eq(communityMembers.userId, ctx.user.id)))
                .returning();
            if (!updated) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member" });
            return { nickname: updated.nickname };
        }),

    /** Mute/unmute a server for the caller (suppresses unread badges) */
    setServerMuted: protectedProcedure
        .input(z.object({ serverId: z.string().uuid(), muted: z.boolean() }))
        .mutation(async ({ ctx, input }) => {
            const [updated] = await db
                .update(communityMembers)
                .set({ muted: input.muted, updatedAt: new Date() })
                .where(and(eq(communityMembers.serverId, input.serverId), eq(communityMembers.userId, ctx.user.id)))
                .returning();
            if (!updated) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member" });
            return { muted: !!updated.muted };
        }),

    // ─── Channel CRUD ────────────────────────────────────

    /** Create a channel */
    createChannel: protectedProcedure
        .input(
            z.object({
                serverId: z.string().uuid(),
                name: z.string().min(1).max(100),
                type: z.enum(["TEXT", "AUDIO", "VIDEO"]).default("TEXT"),
            })
        )
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN", "MODERATOR");

            const [channel] = await db
                .insert(communityChannels)
                .values({
                    name: input.name.toLowerCase().replace(/\s+/g, "-"),
                    type: input.type,
                    serverId: input.serverId,
                    createdById: ctx.user.id,
                })
                .returning();

            await logAudit(input.serverId, ctx.user.id, "channel.create", `created #${channel.name}`);
            return channel;
        }),

    /** Update a channel */
    updateChannel: protectedProcedure
        .input(
            z.object({
                channelId: z.string().uuid(),
                serverId: z.string().uuid(),
                name: z.string().min(1).max(100).optional(),
                type: z.enum(["TEXT", "AUDIO", "VIDEO"]).optional(),
                readOnly: z.boolean().optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN", "MODERATOR");

            const [updated] = await db
                .update(communityChannels)
                .set({
                    ...(input.name && { name: input.name.toLowerCase().replace(/\s+/g, "-") }),
                    ...(input.type && { type: input.type }),
                    ...(input.readOnly !== undefined && { readOnly: input.readOnly }),
                    updatedAt: new Date(),
                })
                .where(eq(communityChannels.id, input.channelId))
                .returning();

            if (updated) await logAudit(input.serverId, ctx.user.id, "channel.update", `updated #${updated.name}`);
            return updated;
        }),

    /** Delete a channel */
    deleteChannel: protectedProcedure
        .input(
            z.object({
                channelId: z.string().uuid(),
                serverId: z.string().uuid(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN", "MODERATOR");

            // Prevent deleting "general"
            const channel = await db
                .select()
                .from(communityChannels)
                .where(eq(communityChannels.id, input.channelId))
                .limit(1);

            if (channel.length && channel[0].name === "general") {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot delete the general channel" });
            }

            await db.delete(communityChannels).where(eq(communityChannels.id, input.channelId));
            if (channel.length) {
                await logAudit(input.serverId, ctx.user.id, "channel.delete", `deleted #${channel[0].name}`);
            }
            return { success: true };
        }),

    // ─── Messages ────────────────────────────────────────

    /** Get paginated messages for a channel */
    /** Toggle an emoji reaction on a message */
    toggleReaction: protectedProcedure
        .input(z.object({ messageId: z.string().uuid(), emoji: z.string().min(1).max(32) }))
        .mutation(async ({ ctx, input }) => {
            const [msg] = await db
                .select({ id: communityMessages.id, channelId: communityMessages.channelId, serverId: communityChannels.serverId })
                .from(communityMessages)
                .innerJoin(communityChannels, eq(communityMessages.channelId, communityChannels.id))
                .where(eq(communityMessages.id, input.messageId))
                .limit(1);
            if (!msg) throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
            const [member] = await db
                .select()
                .from(communityMembers)
                .where(and(eq(communityMembers.serverId, msg.serverId), eq(communityMembers.userId, ctx.user.id)))
                .limit(1);
            if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member" });

            const existing = await db
                .select({ id: communityMessageReactions.id })
                .from(communityMessageReactions)
                .where(and(
                    eq(communityMessageReactions.messageId, input.messageId),
                    eq(communityMessageReactions.memberId, member.id),
                    eq(communityMessageReactions.emoji, input.emoji),
                ))
                .limit(1);
            if (existing.length) {
                await db.delete(communityMessageReactions).where(eq(communityMessageReactions.id, existing[0].id));
            } else {
                await db.insert(communityMessageReactions).values({
                    messageId: input.messageId,
                    memberId: member.id,
                    emoji: input.emoji,
                });
            }
            await notifyChannelChange(msg.channelId);
            return { reacted: !existing.length };
        }),

    /** Toggle the caller's boost on a server (one per member, free v1) */
    toggleBoost: protectedProcedure
        .input(z.object({ serverId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            const [member] = await db
                .select({ id: communityMembers.id })
                .from(communityMembers)
                .where(and(eq(communityMembers.serverId, input.serverId), eq(communityMembers.userId, ctx.user.id)))
                .limit(1);
            if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member" });

            const existing = await db
                .select({ id: communityServerBoosts.id })
                .from(communityServerBoosts)
                .where(and(eq(communityServerBoosts.serverId, input.serverId), eq(communityServerBoosts.memberId, member.id)))
                .limit(1);

            if (existing.length) {
                await db.delete(communityServerBoosts).where(eq(communityServerBoosts.id, existing[0].id));
            } else {
                const { available } = await boostAllowance(ctx.user.id);
                if (available <= 0) {
                    throw new TRPCError({ code: "FORBIDDEN", message: "No boost slots available — get more in the shop or upgrade premium" });
                }
                await db.insert(communityServerBoosts).values({ serverId: input.serverId, memberId: member.id });

                // Boost announcement (on unless explicitly disabled)
                const [srv] = await db
                    .select({ boostMessages: communityServers.boostMessages })
                    .from(communityServers)
                    .where(eq(communityServers.id, input.serverId))
                    .limit(1);
                if (srv?.boostMessages !== false) {
                    const [u] = await db.select({ name: user.name }).from(user).where(eq(user.id, ctx.user.id)).limit(1);
                    await sendSystemMessage(input.serverId, member.id, `${u?.name ?? "Someone"} just boosted the server`);
                }
            }
            return { boosted: !existing.length };
        }),

    /** The caller's boost slots: tier + purchased − in use */
    boostBalance: protectedProcedure.query(({ ctx }) => boostAllowance(ctx.user.id)),

    /**
     * Redeem an on-chain USDC payment for a boost pack. The client transfers
     * the pack price to the premium treasury's USDC ATA, then submits the
     * signature here; we verify the transfer on-chain and grant the slots.
     * tx_signature is UNIQUE so a payment redeems exactly once.
     */
    purchaseBoosts: protectedProcedure
        .input(z.object({ txSignature: z.string().min(64).max(120), boosts: z.number().int().positive() }))
        .mutation(async ({ ctx, input }) => {
            const pack = BOOST_PACKS.find((p) => p.boosts === input.boosts);
            if (!pack) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown boost pack" });

            const already = await db
                .select({ id: communityBoostGrants.id })
                .from(communityBoostGrants)
                .where(eq(communityBoostGrants.txSignature, input.txSignature))
                .limit(1);
            if (already.length) throw new TRPCError({ code: "CONFLICT", message: "This payment was already redeemed" });

            const res = await fetch(getRpcUrl(), {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: 1,
                    method: "getTransaction",
                    params: [input.txSignature, { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 }],
                }),
            });
            const tx = (await res.json())?.result;
            if (!tx) throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found yet — wait a moment and retry" });
            if (tx.meta?.err) throw new TRPCError({ code: "BAD_REQUEST", message: "Transaction failed on-chain" });
            if (tx.blockTime && Date.now() / 1000 - tx.blockTime > 2 * 60 * 60) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Payment too old to redeem" });
            }

            // Expected destination: the treasury's USDC ATA. ATAs are per-mint,
            // so destination equality alone proves the token is USDC.
            const { getAssociatedTokenAddressSync } = await import("@solana/spl-token");
            const { PublicKey } = await import("@solana/web3.js");
            const treasuryAta = getAssociatedTokenAddressSync(
                new PublicKey(USDC_MINT),
                new PublicKey(getBoostTreasuryOwner()),
                true,
            ).toBase58();
            const expected = BigInt(pack.usd) * BigInt(1_000_000);

            type ParsedIx = { program?: string; parsed?: { type?: string; info?: Record<string, unknown> } };
            const instructions: ParsedIx[] = [
                ...(tx.transaction?.message?.instructions ?? []),
                ...((tx.meta?.innerInstructions ?? []) as { instructions: ParsedIx[] }[]).flatMap((i) => i.instructions),
            ];
            const paid = instructions.some((ix) => {
                if (ix.program !== "spl-token") return false;
                const { type, info } = ix.parsed ?? {};
                if ((type !== "transfer" && type !== "transferChecked") || !info) return false;
                if (info.destination !== treasuryAta) return false;
                const raw = type === "transfer"
                    ? (info.amount as string | undefined)
                    : (info.tokenAmount as { amount?: string } | undefined)?.amount;
                return !!raw && BigInt(raw) >= expected;
            });
            if (!paid) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "No matching USDC payment to the treasury in that transaction" });
            }

            await db.insert(communityBoostGrants).values({
                userId: ctx.user.id,
                amount: pack.boosts,
                source: "purchase",
                txSignature: input.txSignature,
                usdPaid: pack.usd,
            });
            return { granted: pack.boosts };
        }),

    /** OG unfurl for link embeds in chat. Cached per isolate; null = no card. */
    linkPreview: protectedProcedure
        .input(z.object({ url: z.string().url().max(2000) }))
        .query(async ({ input }): Promise<LinkPreviewData | null> => {
            let target: URL;
            try {
                target = new URL(input.url);
            } catch {
                return null;
            }
            if (!isPublicHttpUrl(target)) return null;

            const cached = linkPreviewCache.get(target.href);
            if (cached && cached.exp > Date.now()) return cached.data;

            let data: LinkPreviewData | null = null;
            try {
                const res = await fetch(target.href, {
                    redirect: "follow",
                    signal: AbortSignal.timeout(5000),
                    headers: {
                        "user-agent": "Mozilla/5.0 (compatible; watchparty-unfurl/1.0)",
                        accept: "text/html,application/xhtml+xml",
                    },
                });
                const finalUrl = new URL(res.url || target.href);
                const contentType = res.headers.get("content-type") ?? "";
                if (res.ok && isPublicHttpUrl(finalUrl) && contentType.includes("text/html")) {
                    const html = (await res.text()).slice(0, 300_000);
                    const title =
                        metaContent(html, "og:title") ??
                        metaContent(html, "twitter:title") ??
                        (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || null);
                    const image = metaContent(html, "og:image") ?? metaContent(html, "twitter:image");
                    data = {
                        title: title ? decodeEntities(title) : null,
                        description: metaContent(html, "og:description") ?? metaContent(html, "twitter:description"),
                        image: image && /^https?:\/\//.test(image) ? image : null,
                        siteName: metaContent(html, "og:site_name") ?? finalUrl.hostname.replace(/^www\./, ""),
                    };
                    if (!data.title && !data.image) data = null;
                }
            } catch {
                data = null;
            }

            // Cap the cache so a link-spam channel can't grow it unbounded.
            if (linkPreviewCache.size > 500) {
                const oldest = linkPreviewCache.keys().next().value;
                if (oldest) linkPreviewCache.delete(oldest);
            }
            linkPreviewCache.set(target.href, { data, exp: Date.now() + 60 * 60 * 1000 });
            return data;
        }),

    /** Reorder the caller's server rail — serverIds in desired order */
    reorderRail: protectedProcedure
        .input(z.object({ serverIds: z.array(z.string().uuid()).min(1) }))
        .mutation(async ({ ctx, input }) => {
            await Promise.all(input.serverIds.map((serverId, i) =>
                db.update(communityMembers)
                    .set({ railPosition: i })
                    .where(and(eq(communityMembers.serverId, serverId), eq(communityMembers.userId, ctx.user.id)))
            ));
            return { success: true };
        }),

    /** Reorder channels (admin/mod) — channelIds in desired order */
    reorderChannels: protectedProcedure
        .input(z.object({ serverId: z.string().uuid(), channelIds: z.array(z.string().uuid()).min(1) }))
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN", "MODERATOR");
            await Promise.all(input.channelIds.map((id, i) =>
                db.update(communityChannels)
                    .set({ position: i, updatedAt: new Date() })
                    .where(and(eq(communityChannels.id, id), eq(communityChannels.serverId, input.serverId)))
            ));
            return { success: true };
        }),

    /** Pin or unpin a message (admin/mod) */
    setMessagePinned: protectedProcedure
        .input(z.object({ serverId: z.string().uuid(), messageId: z.string().uuid(), pinned: z.boolean() }))
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN", "MODERATOR");
            const [msg] = await db
                .select({ id: communityMessages.id, channelId: communityMessages.channelId, serverId: communityChannels.serverId })
                .from(communityMessages)
                .innerJoin(communityChannels, eq(communityMessages.channelId, communityChannels.id))
                .where(eq(communityMessages.id, input.messageId))
                .limit(1);
            if (!msg || msg.serverId !== input.serverId) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
            }
            await db.update(communityMessages)
                .set({ pinned: input.pinned, updatedAt: new Date() })
                .where(eq(communityMessages.id, input.messageId));
            await notifyChannelChange(msg.channelId);
            return { success: true };
        }),

    /** Pinned messages for a channel */
    getPinnedMessages: protectedProcedure
        .input(z.object({ channelId: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            const channel = await db
                .select()
                .from(communityChannels)
                .where(eq(communityChannels.id, input.channelId))
                .limit(1);
            if (!channel.length) throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found" });
            const member = await db
                .select()
                .from(communityMembers)
                .where(and(
                    eq(communityMembers.serverId, channel[0].serverId),
                    eq(communityMembers.userId, ctx.user.id),
                ))
                .limit(1);
            if (!member.length) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member" });

            return db
                .select({
                    id: communityMessages.id,
                    content: communityMessages.content,
                    fileUrl: communityMessages.fileUrl,
                    createdAt: communityMessages.createdAt,
                    userName: user.name,
                    userImage: user.avatar_url,
                })
                .from(communityMessages)
                .innerJoin(communityMembers, eq(communityMessages.memberId, communityMembers.id))
                .innerJoin(user, eq(communityMembers.userId, user.id))
                .where(and(
                    eq(communityMessages.channelId, input.channelId),
                    eq(communityMessages.pinned, true),
                    eq(communityMessages.deleted, false),
                ))
                .orderBy(desc(communityMessages.createdAt))
                .limit(50);
        }),

    /** Mark a channel read (upsert the member's read marker) */
    markChannelRead: protectedProcedure
        .input(z.object({ channelId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            const channel = await db
                .select()
                .from(communityChannels)
                .where(eq(communityChannels.id, input.channelId))
                .limit(1);
            if (!channel.length) throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found" });
            const member = await db
                .select()
                .from(communityMembers)
                .where(and(
                    eq(communityMembers.serverId, channel[0].serverId),
                    eq(communityMembers.userId, ctx.user.id),
                ))
                .limit(1);
            if (!member.length) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member" });

            await db
                .insert(communityChannelReads)
                .values({ memberId: member[0].id, channelId: input.channelId, lastReadAt: new Date() })
                .onConflictDoUpdate({
                    target: [communityChannelReads.memberId, communityChannelReads.channelId],
                    set: { lastReadAt: new Date() },
                });
            return { success: true };
        }),

    getMessages: protectedProcedure
        .input(
            z.object({
                channelId: z.string().uuid(),
                cursor: z.string().optional(),
                limit: z.number().min(1).max(100).default(50),
            })
        )
        .query(async ({ ctx, input }) => {
            // Get the channel to verify membership
            const channel = await db
                .select()
                .from(communityChannels)
                .where(eq(communityChannels.id, input.channelId))
                .limit(1);

            if (!channel.length) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found" });
            }

            // Verify membership
            const member = await db
                .select()
                .from(communityMembers)
                .where(
                    and(
                        eq(communityMembers.serverId, channel[0].serverId),
                        eq(communityMembers.userId, ctx.user.id)
                    )
                )
                .limit(1);

            if (!member.length) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Not a member" });
            }

            const conditions = [eq(communityMessages.channelId, input.channelId)];
            if (input.cursor) {
                conditions.push(lt(communityMessages.createdAt, new Date(input.cursor)));
            }

            const replyMsg = alias(communityMessages, "reply_msg");
            const replyMember = alias(communityMembers, "reply_member");
            const replyUser = alias(user, "reply_user");

            const msgs = await db
                .select({
                    id: communityMessages.id,
                    content: communityMessages.content,
                    fileUrl: communityMessages.fileUrl,
                    deleted: communityMessages.deleted,
                    pinned: communityMessages.pinned,
                    system: communityMessages.system,
                    replyToId: communityMessages.replyToId,
                    createdAt: communityMessages.createdAt,
                    updatedAt: communityMessages.updatedAt,
                    memberId: communityMessages.memberId,
                    channelId: communityMessages.channelId,
                    memberRole: communityMembers.role,
                    userId: communityMembers.userId,
                    userName: sql<string>`COALESCE(${communityMembers.nickname}, ${user.name})`,
                    userImage: user.avatar_url,
                    userUsername: user.username,
                    replyContent: replyMsg.content,
                    replyDeleted: replyMsg.deleted,
                    replyUserName: sql<string | null>`COALESCE(${replyMember.nickname}, ${replyUser.name})`,
                })
                .from(communityMessages)
                .innerJoin(communityMembers, eq(communityMessages.memberId, communityMembers.id))
                .innerJoin(user, eq(communityMembers.userId, user.id))
                .leftJoin(replyMsg, eq(communityMessages.replyToId, replyMsg.id))
                .leftJoin(replyMember, eq(replyMsg.memberId, replyMember.id))
                .leftJoin(replyUser, eq(replyMember.userId, replyUser.id))
                .where(and(...conditions))
                .orderBy(desc(communityMessages.createdAt))
                .limit(input.limit + 1);

            let nextCursor: string | undefined;
            if (msgs.length > input.limit) {
                const nextItem = msgs.pop()!;
                nextCursor = nextItem.createdAt.toISOString();
            }

            // Reactions for this page, aggregated per message+emoji with
            // whether the current member reacted.
            const ids = msgs.map((m) => m.id);
            const reactionsByMessage = new Map<string, { emoji: string; count: number; reactedByMe: boolean }[]>();
            if (ids.length) {
                const rows = await db
                    .select({
                        messageId: communityMessageReactions.messageId,
                        emoji: communityMessageReactions.emoji,
                        cnt: count(),
                        mine: sql<number>`SUM(CASE WHEN ${communityMessageReactions.memberId} = ${member[0].id} THEN 1 ELSE 0 END)`,
                    })
                    .from(communityMessageReactions)
                    .where(inArray(communityMessageReactions.messageId, ids))
                    .groupBy(communityMessageReactions.messageId, communityMessageReactions.emoji);
                for (const r of rows) {
                    const list = reactionsByMessage.get(r.messageId) ?? [];
                    list.push({ emoji: r.emoji, count: Number(r.cnt), reactedByMe: Number(r.mine) > 0 });
                    reactionsByMessage.set(r.messageId, list);
                }
            }

            return {
                items: msgs.map((m) => ({ ...m, reactions: reactionsByMessage.get(m.id) ?? [] })),
                nextCursor,
            };
        }),

    /** Send a message */
    sendMessage: protectedProcedure
        .input(
            z.object({
                channelId: z.string().uuid(),
                content: z.string().min(1),
                fileUrl: z.string().optional(),
                replyToId: z.string().uuid().optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const channel = await db
                .select()
                .from(communityChannels)
                .where(eq(communityChannels.id, input.channelId))
                .limit(1);

            if (!channel.length) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found" });
            }

            const member = await db
                .select()
                .from(communityMembers)
                .where(
                    and(
                        eq(communityMembers.serverId, channel[0].serverId),
                        eq(communityMembers.userId, ctx.user.id)
                    )
                )
                .limit(1);

            if (!member.length) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Not a member" });
            }

            if (channel[0].readOnly && member[0].role === "GUEST") {
                throw new TRPCError({ code: "FORBIDDEN", message: "This channel is read-only" });
            }

            // AutoMod: rules apply to members (mods/admins exempt).
            if (member[0].role === "GUEST") {
                const [srv] = await db
                    .select({
                        automodKeywords: communityServers.automodKeywords,
                        automodBlockLinks: communityServers.automodBlockLinks,
                        automodBlockMentions: communityServers.automodBlockMentions,
                    })
                    .from(communityServers)
                    .where(eq(communityServers.id, channel[0].serverId))
                    .limit(1);
                const blocked = parseKeywords(srv?.automodKeywords);
                const lower = input.content.toLowerCase();
                if (blocked.some((w) => lower.includes(w))) {
                    throw new TRPCError({ code: "BAD_REQUEST", message: "Message blocked by this server's AutoMod" });
                }
                if (srv?.automodBlockLinks && /https?:\/\//i.test(input.content)) {
                    throw new TRPCError({ code: "BAD_REQUEST", message: "Links are blocked by this server's AutoMod" });
                }
                if (srv?.automodBlockMentions && (input.content.match(/@[a-zA-Z0-9_-]+/g)?.length ?? 0) > 5) {
                    throw new TRPCError({ code: "BAD_REQUEST", message: "Too many mentions — blocked by this server's AutoMod" });
                }
            }

            const [message] = await db
                .insert(communityMessages)
                .values({
                    content: input.content,
                    fileUrl: input.fileUrl ?? null,
                    memberId: member[0].id,
                    channelId: input.channelId,
                    replyToId: input.replyToId ?? null,
                })
                .returning();

            await notifyChannelChange(input.channelId);
            return message;
        }),

    /** Update a message (owner only) */
    updateMessage: protectedProcedure
        .input(
            z.object({
                messageId: z.string().uuid(),
                content: z.string().min(1),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const msg = await db
                .select({
                    id: communityMessages.id,
                    userId: communityMembers.userId,
                })
                .from(communityMessages)
                .innerJoin(communityMembers, eq(communityMessages.memberId, communityMembers.id))
                .where(eq(communityMessages.id, input.messageId))
                .limit(1);

            if (!msg.length || msg[0].userId !== ctx.user.id) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Cannot edit this message" });
            }

            const [updated] = await db
                .update(communityMessages)
                .set({ content: input.content, updatedAt: new Date() })
                .where(eq(communityMessages.id, input.messageId))
                .returning();

            if (updated) await notifyChannelChange(updated.channelId);
            return updated;
        }),

    /** Delete a message (soft delete — owner, admin, or mod) */
    deleteMessage: protectedProcedure
        .input(
            z.object({
                messageId: z.string().uuid(),
                serverId: z.string().uuid(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            // Check if current user is admin/mod OR the message owner
            const msg = await db
                .select({
                    id: communityMessages.id,
                    userId: communityMembers.userId,
                })
                .from(communityMessages)
                .innerJoin(communityMembers, eq(communityMessages.memberId, communityMembers.id))
                .where(eq(communityMessages.id, input.messageId))
                .limit(1);

            if (!msg.length) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
            }

            const isOwner = msg[0].userId === ctx.user.id;
            if (!isOwner) {
                await requireRole(input.serverId, ctx.user.id, "ADMIN", "MODERATOR");
            }

            const [updated] = await db
                .update(communityMessages)
                .set({ deleted: true, content: "This message has been deleted.", fileUrl: null, updatedAt: new Date() })
                .where(eq(communityMessages.id, input.messageId))
                .returning();

            if (updated) await notifyChannelChange(updated.channelId);
            return updated;
        }),
});

// ─── Helpers ─────────────────────────────────────────────

async function requireRole(serverId: string, userId: string, ...roles: string[]) {
    const member = await db
        .select()
        .from(communityMembers)
        .where(
            and(
                eq(communityMembers.serverId, serverId),
                eq(communityMembers.userId, userId)
            )
        )
        .limit(1);

    if (!member.length) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this server" });
    }

    if (!roles.includes(member[0].role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: `Requires ${roles.join(" or ")} role` });
    }

    return member[0];
}
