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
    communitySounds,
    communityChannelCategories,
    communityWebhooks,
    communityRoles,
    communityMemberRoles,
    communityInvites,
} from "@/db/schema/community";
import { user } from "@/db/schema";
import { premiumSubscriptions } from "@/db/schema/content";
import { TIERS, USDC_MINT, type TierKey } from "@/lib/premium/tiers";
import { BOOST_PACKS, getBoostTreasuryOwner } from "@/lib/premium/boosts";
import { boostLevelFor } from "@/lib/premium/boost-levels";
import { isEntitled } from "@/server/lib/premium-entitlement";
import { takePage } from "@/server/lib/paginate";
import { DELETED_MESSAGE_TEXT } from "@/lib/community/constants";
import { getRpcUrl } from "@/lib/chains/solana/subscriptions/constants";
import { eq, and, or, desc, asc, sql, lt, ne, count, inArray, gt, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { publishToRoom } from "@/lib/realtime/publish";
import { rooms } from "@/lib/realtime/protocol";
import { isMediaEnabled, createMeeting, addParticipant, REALTIMEKIT_PRESETS } from "@/lib/realtime/media/realtimekit";
import { encodeKeysetCursor, parseKeysetCursor, keysetAfter } from "@/server/lib/keyset";

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

/**
 * When the server enforces mod 2FA, destructive actions (kick/ban/role
 * changes/channel deletes) require the acting moderator to have 2FA enabled.
 */
async function require2faIfEnforced(serverId: string, userId: string) {
    const [srv] = await db
        .select({ requireMod2fa: communityServers.requireMod2fa })
        .from(communityServers)
        .where(eq(communityServers.id, serverId))
        .limit(1);
    if (!srv?.requireMod2fa) return;
    const [u] = await db
        .select({ twoFactorEnabled: user.twoFactorEnabled })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1);
    if (!u?.twoFactorEnabled) {
        throw new TRPCError({
            code: "FORBIDDEN",
            message: "This server requires two-factor authentication for moderator actions — enable 2FA in your account settings first",
        });
    }
}

/**
 * Resolve any invite code — the server's main code, its vanity code, or a
 * per-link code from community_invites. Per-link codes carry uses/expiry;
 * `invite` is returned so joins can count the use.
 */
async function resolveInviteCode(code: string): Promise<{
    server: typeof communityServers.$inferSelect;
    invite: typeof communityInvites.$inferSelect | null;
    expired: boolean;
} | null> {
    const [direct] = await db
        .select()
        .from(communityServers)
        .where(or(eq(communityServers.inviteCode, code), eq(communityServers.customInvite, code)))
        .limit(1);
    if (direct) return { server: direct, invite: null, expired: false };

    const [inviteRow] = await db
        .select()
        .from(communityInvites)
        .where(eq(communityInvites.code, code))
        .limit(1);
    if (!inviteRow) return null;
    const [server] = await db
        .select()
        .from(communityServers)
        .where(eq(communityServers.id, inviteRow.serverId))
        .limit(1);
    if (!server) return null;
    const expired =
        (inviteRow.expiresAt !== null && inviteRow.expiresAt.getTime() < Date.now()) ||
        (inviteRow.maxUses !== null && inviteRow.uses >= inviteRow.maxUses);
    return { server, invite: inviteRow, expired };
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
    // Shared predicate (server/lib/premium-entitlement.ts) — this used to be a
    // second hand-written copy of the active/past_due/periodEnd rule.
    const tierActive = !!sub && isEntitled(sub);
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

// AutoMod "commonly flagged words" — a small built-in list; the custom
// keywords field covers anything server-specific.
const FLAGGED_WORDS = [
    "nigger", "faggot", "retard", "kike", "spic", "chink", "tranny",
    "rape", "kys", "kill yourself",
];

// Activity alerts: joins in the last 10 min above this → one system notice
// (throttled to one notice per window by the audit trail).
const ACTIVITY_ALERT_JOINS = 10;
const ACTIVITY_ALERT_WINDOW_MS = 10 * 60 * 1000;

/** Join-surge notice for servers with activity alerts on. Best-effort. */
async function maybeActivityAlert(
    server: { id: string; activityAlerts: boolean | null },
    memberId: string,
) {
    if (!server.activityAlerts) return;
    try {
        const windowStart = new Date(Date.now() - ACTIVITY_ALERT_WINDOW_MS);
        const [{ n }] = await db
            .select({ n: count() })
            .from(communityMembers)
            .where(and(eq(communityMembers.serverId, server.id), gt(communityMembers.createdAt, windowStart)));
        if (Number(n) < ACTIVITY_ALERT_JOINS) return;

        // One alert per window: skip if we already posted one recently.
        const [recent] = await db
            .select({ id: communityAuditLog.id })
            .from(communityAuditLog)
            .where(and(
                eq(communityAuditLog.serverId, server.id),
                eq(communityAuditLog.action, "safety.activity_alert"),
                gt(communityAuditLog.createdAt, windowStart),
            ))
            .limit(1);
        if (recent) return;

        await db.insert(communityAuditLog).values({
            serverId: server.id,
            actorUserId: "system",
            action: "safety.activity_alert",
            detail: `unusual join activity: ${n} joins in 10 minutes`,
        });
        await sendSystemMessage(server.id, memberId, `Unusual activity: ${n} people joined in the last 10 minutes`);
    } catch {
        // alerts are best-effort
    }
}

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
                defaultNotifications: communityServers.defaultNotifications,
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

        // Muted servers stay quiet on the rail: no unread pill; mentions still
        // show. Servers set to mentions-only skip the generic unread pill too.
        return servers.map((s) => ({
            ...s,
            hasUnread: !s.muted && s.defaultNotifications !== "mentions" && unreadSet.has(s.id),
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
                    // IS DISTINCT FROM: webhook messages (NULL member) still count
                    sql`${communityMessages.memberId} IS DISTINCT FROM ${membership[0].id}`,
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
                    joinMethod: communityMembers.joinMethod,
                    lastSeenAt: user.lastSeenAt,
                })
                .from(communityMembers)
                .innerJoin(user, eq(communityMembers.userId, user.id))
                .where(eq(communityMembers.serverId, input.serverId))
                .orderBy(asc(communityMembers.role));

            const boosts = await db
                .select({ memberId: communityServerBoosts.memberId })
                .from(communityServerBoosts)
                .where(eq(communityServerBoosts.serverId, input.serverId));

            // Custom roles + assignments → colored names in chat/member lists.
            const roles = await db
                .select()
                .from(communityRoles)
                .where(eq(communityRoles.serverId, input.serverId))
                .orderBy(sql`${communityRoles.position} ASC NULLS LAST`, asc(communityRoles.createdAt));
            const assignments = roles.length
                ? await db
                    .select({ memberId: communityMemberRoles.memberId, roleId: communityMemberRoles.roleId })
                    .from(communityMemberRoles)
                    .where(inArray(communityMemberRoles.roleId, roles.map((r) => r.id)))
                : [];
            const rolesByMember = new Map<string, string[]>();
            for (const a of assignments) {
                rolesByMember.set(a.memberId, [...(rolesByMember.get(a.memberId) ?? []), a.roleId]);
            }
            // Name color = the member's highest role (first in position order)
            const colorFor = (memberId: string) => {
                const mine = rolesByMember.get(memberId);
                if (!mine?.length) return null;
                return roles.find((r) => mine.includes(r.id))?.color ?? null;
            };

            const categories = await db
                .select()
                .from(communityChannelCategories)
                .where(eq(communityChannelCategories.serverId, input.serverId))
                .orderBy(sql`${communityChannelCategories.position} ASC NULLS LAST`, asc(communityChannelCategories.createdAt));

            return {
                server: server[0],
                channels: channelsWithUnread,
                categories,
                members: members.map((m) => ({
                    ...m,
                    roleIds: rolesByMember.get(m.id) ?? [],
                    roleColor: colorFor(m.id),
                })),
                currentMember: membership[0],
                roles,
                boostCount: boosts.length,
                boostedByMe: boosts.some((b) => b.memberId === membership[0].id),
            };
        }),

    /** Create a new server (optionally from a template — copies structure) */
    createServer: protectedProcedure
        .input(
            z.object({
                name: z.string().min(1).max(100),
                imageUrl: z.string().optional(),
                templateCode: z.string().optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const inviteCode = nanoid(8);

            // Template source: channels + safety/automod/engagement settings.
            // Never messages, members, expressions, boosts, or the icon.
            let template: typeof communityServers.$inferSelect | undefined;
            if (input.templateCode) {
                [template] = await db
                    .select()
                    .from(communityServers)
                    .where(eq(communityServers.templateCode, input.templateCode))
                    .limit(1);
            }

            const [newServer] = await db
                .insert(communityServers)
                .values({
                    name: input.name,
                    imageUrl: input.imageUrl ?? null,
                    inviteCode,
                    ownerId: ctx.user.id,
                    ...(template ? {
                        automodKeywords: template.automodKeywords,
                        automodBlockLinks: template.automodBlockLinks,
                        automodBlockMentions: template.automodBlockMentions,
                        automodFlaggedWords: template.automodFlaggedWords,
                        verificationLevel: template.verificationLevel,
                        blurMedia: template.blurMedia,
                        welcomeMessages: template.welcomeMessages,
                        boostMessages: template.boostMessages,
                        defaultNotifications: template.defaultNotifications,
                        rules: template.rules,
                        rulesRequired: template.rulesRequired,
                    } : {}),
                })
                .returning();

            // Add owner as ADMIN member
            await db.insert(communityMembers).values({
                userId: ctx.user.id,
                serverId: newServer.id,
                role: "ADMIN",
            });

            // Channels: the template's structure, or the default #general
            if (template) {
                const templateChannels = await db
                    .select({ name: communityChannels.name, type: communityChannels.type, position: communityChannels.position, readOnly: communityChannels.readOnly })
                    .from(communityChannels)
                    .where(eq(communityChannels.serverId, template.id))
                    .orderBy(sql`${communityChannels.position} ASC NULLS LAST`, asc(communityChannels.createdAt));
                if (templateChannels.length > 0) {
                    await db.insert(communityChannels).values(templateChannels.map((c, i) => ({
                        name: c.name,
                        type: c.type,
                        position: c.position ?? i,
                        readOnly: c.readOnly,
                        serverId: newServer.id,
                        createdById: ctx.user.id,
                    })));
                }
            }
            const [hasChannel] = await db
                .select({ id: communityChannels.id })
                .from(communityChannels)
                .where(eq(communityChannels.serverId, newServer.id))
                .limit(1);
            if (!hasChannel) await db.insert(communityChannels).values({
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
                verificationLevel: z.enum(["none", "low", "medium", "high"]).optional(),
                requireMod2fa: z.boolean().optional(),
                blurMedia: z.boolean().optional(),
                discoverable: z.boolean().optional(),
                bannerImageUrl: z.string().url().nullable().optional(),
                rules: z.string().max(4000).nullable().optional(),
                rulesRequired: z.boolean().optional(),
                ageRestricted: z.boolean().optional(),
                tagBadge: z.string().max(8).nullable().optional(),
                tagColor: z.string().max(64).nullable().optional(),
                customInvite: z.string().regex(/^[a-z0-9-]{3,24}$/).nullable().optional(),
                showBoostBar: z.boolean().optional(),
                defaultNotifications: z.enum(["all", "mentions"]).optional(),
                activityAlerts: z.boolean().optional(),
                automodFlaggedWords: z.boolean().optional(),
                widgetEnabled: z.boolean().optional(),
                activityFeed: z.boolean().optional(),
                inactiveChannelId: z.string().uuid().nullable().optional(),
                inactiveTimeoutMinutes: z.number().int().min(1).max(120).nullable().optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN");

            // The 2FA requirement is owner-only, and turning it on requires
            // the owner to have 2FA themselves (they're bound by it too).
            if (input.requireMod2fa !== undefined) {
                const [srv] = await db
                    .select({ ownerId: communityServers.ownerId })
                    .from(communityServers)
                    .where(eq(communityServers.id, input.serverId))
                    .limit(1);
                if (srv?.ownerId !== ctx.user.id) {
                    throw new TRPCError({ code: "FORBIDDEN", message: "Only the server owner can change the 2FA requirement" });
                }
                if (input.requireMod2fa) {
                    const [me] = await db.select({ twoFactorEnabled: user.twoFactorEnabled }).from(user).where(eq(user.id, ctx.user.id)).limit(1);
                    if (!me?.twoFactorEnabled) {
                        throw new TRPCError({ code: "FORBIDDEN", message: "Enable 2FA on your own account before requiring it for moderators" });
                    }
                }
            }

            // Banner images are a boost perk (level 1+)
            if (input.bannerImageUrl) {
                const [{ n }] = await db
                    .select({ n: count() })
                    .from(communityServerBoosts)
                    .where(eq(communityServerBoosts.serverId, input.serverId));
                if (!boostLevelFor(Number(n)).bannerImage) {
                    throw new TRPCError({ code: "FORBIDDEN", message: "Banner images unlock at boost level 1 (2 boosts)" });
                }
            }

            // Custom invite links are the level-3 boost perk, and codes are global.
            if (input.customInvite) {
                const [{ n }] = await db
                    .select({ n: count() })
                    .from(communityServerBoosts)
                    .where(eq(communityServerBoosts.serverId, input.serverId));
                if (boostLevelFor(Number(n)).level < 3) {
                    throw new TRPCError({ code: "FORBIDDEN", message: "Custom invite links unlock at boost level 3 (14 boosts)" });
                }
                const [taken] = await db
                    .select({ id: communityServers.id })
                    .from(communityServers)
                    .where(and(eq(communityServers.customInvite, input.customInvite), ne(communityServers.id, input.serverId)))
                    .limit(1);
                if (taken) throw new TRPCError({ code: "CONFLICT", message: "That invite link is taken — try another" });
            }

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
                    ...(input.verificationLevel !== undefined && { verificationLevel: input.verificationLevel }),
                    ...(input.requireMod2fa !== undefined && { requireMod2fa: input.requireMod2fa }),
                    ...(input.blurMedia !== undefined && { blurMedia: input.blurMedia }),
                    ...(input.discoverable !== undefined && { discoverable: input.discoverable }),
                    ...(input.bannerImageUrl !== undefined && { bannerImageUrl: input.bannerImageUrl }),
                    ...(input.rules !== undefined && { rules: input.rules?.trim() || null }),
                    ...(input.rulesRequired !== undefined && { rulesRequired: input.rulesRequired }),
                    ...(input.ageRestricted !== undefined && { ageRestricted: input.ageRestricted }),
                    ...(input.tagBadge !== undefined && { tagBadge: input.tagBadge }),
                    ...(input.tagColor !== undefined && { tagColor: input.tagColor }),
                    ...(input.customInvite !== undefined && { customInvite: input.customInvite }),
                    ...(input.showBoostBar !== undefined && { showBoostBar: input.showBoostBar }),
                    ...(input.defaultNotifications !== undefined && { defaultNotifications: input.defaultNotifications }),
                    ...(input.activityAlerts !== undefined && { activityAlerts: input.activityAlerts }),
                    ...(input.automodFlaggedWords !== undefined && { automodFlaggedWords: input.automodFlaggedWords }),
                    ...(input.widgetEnabled !== undefined && { widgetEnabled: input.widgetEnabled }),
                    ...(input.activityFeed !== undefined && { activityFeed: input.activityFeed }),
                    ...(input.inactiveChannelId !== undefined && { inactiveChannelId: input.inactiveChannelId }),
                    ...(input.inactiveTimeoutMinutes !== undefined && { inactiveTimeoutMinutes: input.inactiveTimeoutMinutes }),
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

    /**
     * PUBLIC widget data for the embeddable /widget/[serverId] page — only
     * servers that opted in (widgetEnabled) respond, and only with safe
     * fields: name, icon, member count, online count, invite code.
     */
    getWidget: publicProcedure
        .input(z.object({ serverId: z.string().uuid() }))
        .query(async ({ input }) => {
            const [server] = await db
                .select()
                .from(communityServers)
                .where(and(eq(communityServers.id, input.serverId), eq(communityServers.widgetEnabled, true)))
                .limit(1);
            if (!server) throw new TRPCError({ code: "NOT_FOUND", message: "Widget not available" });

            const [{ n: memberCount }] = await db
                .select({ n: count() })
                .from(communityMembers)
                .where(eq(communityMembers.serverId, server.id));

            // "Online" = members seen in the last 10 minutes
            const [{ n: onlineCount }] = await db
                .select({ n: count() })
                .from(communityMembers)
                .innerJoin(user, eq(communityMembers.userId, user.id))
                .where(and(
                    eq(communityMembers.serverId, server.id),
                    gt(user.lastSeenAt, new Date(Date.now() - 10 * 60 * 1000)),
                ));

            return {
                name: server.name,
                imageUrl: server.imageUrl,
                tag: server.tag,
                bannerColor: server.bannerColor,
                memberCount: Number(memberCount),
                onlineCount: Number(onlineCount),
                inviteCode: server.customInvite ?? server.inviteCode,
            };
        }),

    /** Invite-link landing data. Private profiles reveal only name + icon. */
    getInvitePreview: protectedProcedure
        .input(z.object({ inviteCode: z.string().min(1) }))
        .query(async ({ ctx, input }) => {
            const resolved = await resolveInviteCode(input.inviteCode);
            if (!resolved || resolved.expired) {
                throw new TRPCError({ code: "NOT_FOUND", message: "This invite is invalid or expired" });
            }
            const { server } = resolved;

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
                bannerImageUrl: isPrivate ? null : server.bannerImageUrl,
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
            const resolved = await resolveInviteCode(input.inviteCode);
            if (!resolved) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Invalid invite code" });
            }
            if (resolved.expired) {
                throw new TRPCError({ code: "FORBIDDEN", message: "This invite has expired or hit its use limit" });
            }
            const server = [resolved.server];

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
                    joinMethod: "invite",
                })
                .returning();

            // Per-link invites count their use (best-effort)
            if (resolved.invite && newMember) {
                await db
                    .update(communityInvites)
                    .set({ uses: sql`${communityInvites.uses} + 1` })
                    .where(eq(communityInvites.id, resolved.invite.id))
                    .catch(() => {});
            }

            // Welcome announcement (on unless explicitly disabled)
            if (server[0].welcomeMessages !== false && newMember) {
                const [u] = await db.select({ name: user.name }).from(user).where(eq(user.id, ctx.user.id)).limit(1);
                const template = WELCOME_TEMPLATES[Math.floor(Math.random() * WELCOME_TEMPLATES.length)];
                await sendSystemMessage(server[0].id, newMember.id, template.replace("{name}", u?.name ?? "Someone"));
            }

            if (newMember) await maybeActivityAlert(server[0], newMember.id);

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
            await require2faIfEnforced(input.serverId, ctx.user.id);

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
            await require2faIfEnforced(input.serverId, ctx.user.id);

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
            await require2faIfEnforced(input.serverId, ctx.user.id);

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
                    actorUserId: communityAuditLog.actorUserId,
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
                .where(and(eq(communityMembers.serverId, input.serverId), gt(communityMembers.createdAt, weekAgo)));

            const [messages7d] = await db
                .select({ n: count() })
                .from(communityMessages)
                .innerJoin(communityChannels, eq(communityMessages.channelId, communityChannels.id))
                .where(and(
                    eq(communityChannels.serverId, input.serverId),
                    eq(communityMessages.deleted, false),
                    gt(communityMessages.createdAt, weekAgo),
                ));

            const [activeMembers] = await db
                .select({ n: sql<number>`COUNT(DISTINCT ${communityMessages.memberId})` })
                .from(communityMessages)
                .innerJoin(communityChannels, eq(communityMessages.channelId, communityChannels.id))
                .where(and(
                    eq(communityChannels.serverId, input.serverId),
                    eq(communityMessages.deleted, false),
                    gt(communityMessages.createdAt, weekAgo),
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
                    gt(communityMessages.createdAt, weekAgo),
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

    // ─── Prune inactive members ──────────────────────────

    /** How many members a prune would remove (admin). Preview before pulling the trigger. */
    getPruneCount: protectedProcedure
        .input(z.object({ serverId: z.string().uuid(), days: z.number().int().min(7).max(180) }))
        .query(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN");
            const cutoff = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

            const [{ n }] = await db
                .select({ n: count() })
                .from(communityMembers)
                .where(and(
                    eq(communityMembers.serverId, input.serverId),
                    eq(communityMembers.role, "GUEST"),
                    lt(communityMembers.createdAt, cutoff),
                    sql`NOT EXISTS (SELECT 1 FROM community_messages msg WHERE msg.member_id = ${communityMembers.id} AND msg.created_at > ${cutoff.toISOString()}::timestamptz)`,
                ));
            return { count: Number(n) };
        }),

    /**
     * Remove members with no messages in the window (admin). Only GUESTs who
     * joined before the cutoff are eligible; kicked members can rejoin.
     */
    pruneMembers: protectedProcedure
        .input(z.object({ serverId: z.string().uuid(), days: z.number().int().min(7).max(180) }))
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN");
            await require2faIfEnforced(input.serverId, ctx.user.id);
            const cutoff = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

            const removed = await db
                .delete(communityMembers)
                .where(and(
                    eq(communityMembers.serverId, input.serverId),
                    eq(communityMembers.role, "GUEST"),
                    lt(communityMembers.createdAt, cutoff),
                    sql`NOT EXISTS (SELECT 1 FROM community_messages msg WHERE msg.member_id = ${communityMembers.id} AND msg.created_at > ${cutoff.toISOString()}::timestamptz)`,
                ))
                .returning({ id: communityMembers.id });

            await logAudit(input.serverId, ctx.user.id, "member.prune", `pruned ${removed.length} inactive member${removed.length === 1 ? "" : "s"} (${input.days} days)`);
            return { removed: removed.length };
        }),

    // ─── Custom roles (colored names over the 3 tiers) ───

    /** Create a custom role (admin) */
    createRole: protectedProcedure
        .input(z.object({
            serverId: z.string().uuid(),
            name: z.string().min(1).max(32),
            color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex value"),
        }))
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN");

            const [{ n }] = await db
                .select({ n: count() })
                .from(communityRoles)
                .where(eq(communityRoles.serverId, input.serverId));
            if (Number(n) >= 20) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Servers can have up to 20 custom roles" });
            }

            const [created] = await db
                .insert(communityRoles)
                .values({ serverId: input.serverId, name: input.name.trim(), color: input.color, position: Number(n) })
                .returning();
            await logAudit(input.serverId, ctx.user.id, "role.create", `created the ${created.name} role`);
            return created;
        }),

    /** Rename/recolor a custom role (admin) */
    updateRole: protectedProcedure
        .input(z.object({
            serverId: z.string().uuid(),
            roleId: z.string().uuid(),
            name: z.string().min(1).max(32).optional(),
            color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN");

            const [updated] = await db
                .update(communityRoles)
                .set({
                    ...(input.name && { name: input.name.trim() }),
                    ...(input.color && { color: input.color }),
                })
                .where(and(eq(communityRoles.id, input.roleId), eq(communityRoles.serverId, input.serverId)))
                .returning();
            if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Role not found" });
            await logAudit(input.serverId, ctx.user.id, "role.update", `updated the ${updated.name} role`);
            return updated;
        }),

    /** Reorder custom roles (admin) — roleIds in desired order; first = highest */
    reorderRoles: protectedProcedure
        .input(z.object({ serverId: z.string().uuid(), roleIds: z.array(z.string().uuid()).min(1) }))
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN");
            await Promise.all(input.roleIds.map((id, i) =>
                db.update(communityRoles)
                    .set({ position: i })
                    .where(and(eq(communityRoles.id, id), eq(communityRoles.serverId, input.serverId)))
            ));
            return { success: true };
        }),

    /** Delete a custom role (admin) — assignments cascade */
    deleteRole: protectedProcedure
        .input(z.object({ serverId: z.string().uuid(), roleId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN");

            const [removed] = await db
                .delete(communityRoles)
                .where(and(eq(communityRoles.id, input.roleId), eq(communityRoles.serverId, input.serverId)))
                .returning();
            if (removed) await logAudit(input.serverId, ctx.user.id, "role.delete", `deleted the ${removed.name} role`);
            return { success: true };
        }),

    /** Give or take a custom role on a member (admin/mod) */
    toggleMemberRole: protectedProcedure
        .input(z.object({ serverId: z.string().uuid(), memberId: z.string().uuid(), roleId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN", "MODERATOR");

            const [role] = await db
                .select()
                .from(communityRoles)
                .where(and(eq(communityRoles.id, input.roleId), eq(communityRoles.serverId, input.serverId)))
                .limit(1);
            if (!role) throw new TRPCError({ code: "NOT_FOUND", message: "Role not found" });
            const [target] = await db
                .select({ id: communityMembers.id, userId: communityMembers.userId })
                .from(communityMembers)
                .where(and(eq(communityMembers.id, input.memberId), eq(communityMembers.serverId, input.serverId)))
                .limit(1);
            if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });

            const existing = await db
                .select({ id: communityMemberRoles.id })
                .from(communityMemberRoles)
                .where(and(eq(communityMemberRoles.memberId, input.memberId), eq(communityMemberRoles.roleId, input.roleId)))
                .limit(1);
            if (existing.length) {
                await db.delete(communityMemberRoles).where(eq(communityMemberRoles.id, existing[0].id));
            } else {
                await db.insert(communityMemberRoles).values({ memberId: input.memberId, roleId: input.roleId }).onConflictDoNothing();
            }

            const [u] = await db.select({ name: user.name }).from(user).where(eq(user.id, target.userId)).limit(1);
            await logAudit(input.serverId, ctx.user.id, "role.assign", `${existing.length ? "removed" : "gave"} ${role.name} ${existing.length ? "from" : "to"} ${u?.name ?? "a member"}`);
            return { assigned: !existing.length };
        }),

    // ─── Discovery (join without an invite) ──────────────

    /** Servers that opted into discovery, biggest first */
    listDiscoverable: protectedProcedure.query(async ({ ctx }) => {
        const rows = await db
            .select({
                id: communityServers.id,
                name: communityServers.name,
                imageUrl: communityServers.imageUrl,
                tag: communityServers.tag,
                bannerColor: communityServers.bannerColor,
                bannerImageUrl: communityServers.bannerImageUrl,
                description: communityServers.description,
                memberCount: sql<number>`(SELECT COUNT(*) FROM community_members cm WHERE cm.server_id = ${communityServers.id})`,
                joined: sql<boolean>`EXISTS (SELECT 1 FROM community_members cm WHERE cm.server_id = ${communityServers.id} AND cm.user_id = ${ctx.user.id})`,
            })
            .from(communityServers)
            .where(eq(communityServers.discoverable, true))
            .orderBy(sql`(SELECT COUNT(*) FROM community_members cm WHERE cm.server_id = ${communityServers.id}) DESC`)
            .limit(24);
        return rows.map((r) => ({ ...r, memberCount: Number(r.memberCount), joined: !!r.joined }));
    }),

    /** Join a discoverable server directly (no invite code) */
    joinDiscoverable: protectedProcedure
        .input(z.object({ serverId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            const [server] = await db
                .select()
                .from(communityServers)
                .where(eq(communityServers.id, input.serverId))
                .limit(1);
            if (!server?.discoverable) {
                throw new TRPCError({ code: "NOT_FOUND", message: "This server isn't open to discovery" });
            }

            const existing = await db
                .select({ id: communityMembers.id })
                .from(communityMembers)
                .where(and(eq(communityMembers.serverId, server.id), eq(communityMembers.userId, ctx.user.id)))
                .limit(1);
            if (existing.length) return { serverId: server.id, alreadyMember: true };

            const banned = await db
                .select({ id: communityBans.id })
                .from(communityBans)
                .where(and(eq(communityBans.serverId, server.id), eq(communityBans.userId, ctx.user.id)))
                .limit(1);
            if (banned.length) {
                throw new TRPCError({ code: "FORBIDDEN", message: "You are banned from this server" });
            }

            const [newMember] = await db
                .insert(communityMembers)
                .values({ userId: ctx.user.id, serverId: server.id, role: "GUEST", joinMethod: "discovery" })
                .returning();

            if (server.welcomeMessages !== false && newMember) {
                const [u] = await db.select({ name: user.name }).from(user).where(eq(user.id, ctx.user.id)).limit(1);
                const template = WELCOME_TEMPLATES[Math.floor(Math.random() * WELCOME_TEMPLATES.length)];
                await sendSystemMessage(server.id, newMember.id, template.replace("{name}", u?.name ?? "Someone"));
            }

            if (newMember) await maybeActivityAlert(server, newMember.id);

            return { serverId: server.id, alreadyMember: false };
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

            // Slot caps scale with the server's boost level
            const [{ n: boostCount }] = await db
                .select({ n: count() })
                .from(communityServerBoosts)
                .where(eq(communityServerBoosts.serverId, input.serverId));
            const level = boostLevelFor(Number(boostCount));
            const cap = input.kind === "emoji" ? level.emojiSlots : level.stickerSlots;
            const [{ n: existing }] = await db
                .select({ n: count() })
                .from(communityExpressions)
                .where(and(eq(communityExpressions.serverId, input.serverId), eq(communityExpressions.kind, input.kind)));
            if (Number(existing) >= cap) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: `All ${cap} ${input.kind} slots are used — boost the server to unlock more`,
                });
            }

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

    // ─── Soundboard (short clips played into voice channels) ───

    /** All soundboard sounds on a server (member) */
    listSounds: protectedProcedure
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
                .from(communitySounds)
                .where(eq(communitySounds.serverId, input.serverId))
                .orderBy(asc(communitySounds.name));
        }),

    /** Add a soundboard sound (admin/mod) */
    addSound: protectedProcedure
        .input(
            z.object({
                serverId: z.string().uuid(),
                name: z.string().min(2).max(32).regex(/^[a-z0-9_]+$/, "Lowercase letters, numbers, and underscores only"),
                emoji: z.string().max(16).optional(),
                audioUrl: z.string().url(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN", "MODERATOR");

            // Slot caps scale with the server's boost level
            const [{ n: boostCount }] = await db
                .select({ n: count() })
                .from(communityServerBoosts)
                .where(eq(communityServerBoosts.serverId, input.serverId));
            const cap = boostLevelFor(Number(boostCount)).soundSlots;
            const [{ n: existing }] = await db
                .select({ n: count() })
                .from(communitySounds)
                .where(eq(communitySounds.serverId, input.serverId));
            if (Number(existing) >= cap) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: `All ${cap} sound slots are used — boost the server to unlock more`,
                });
            }

            const [created] = await db
                .insert(communitySounds)
                .values({
                    serverId: input.serverId,
                    name: input.name,
                    emoji: input.emoji ?? null,
                    audioUrl: input.audioUrl,
                    createdBy: ctx.user.id,
                })
                .onConflictDoNothing()
                .returning();
            if (!created) throw new TRPCError({ code: "CONFLICT", message: `A sound named ${input.name} already exists` });

            await logAudit(input.serverId, ctx.user.id, "sound.add", `added sound ${input.name}`);
            return created;
        }),

    /** Remove a soundboard sound (admin/mod) */
    deleteSound: protectedProcedure
        .input(z.object({ serverId: z.string().uuid(), soundId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN", "MODERATOR");

            const [removed] = await db
                .delete(communitySounds)
                .where(and(eq(communitySounds.id, input.soundId), eq(communitySounds.serverId, input.serverId)))
                .returning();
            if (removed) {
                await logAudit(input.serverId, ctx.user.id, "sound.delete", `removed sound ${removed.name}`);
            }
            return { success: true };
        }),

    /**
     * WebRTC token for an AUDIO/VIDEO channel — the Spaces RealtimeKit stack
     * reused for persistent voice channels. Unlike Spaces (host/speaker/
     * listener), every member of a voice channel can speak; VIDEO channels
     * additionally allow camera + screenshare (canVideo drives the client UI;
     * the SFU preset already permits publishing).
     */
    getVoiceToken: protectedProcedure
        .input(z.object({ channelId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            if (!isMediaEnabled()) return { enabled: false as const };

            const [channel] = await db
                .select()
                .from(communityChannels)
                .where(eq(communityChannels.id, input.channelId))
                .limit(1);
            if (!channel) throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found" });
            if (channel.type === "TEXT") {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Not a voice channel" });
            }

            const [member] = await db
                .select({ id: communityMembers.id })
                .from(communityMembers)
                .where(and(eq(communityMembers.serverId, channel.serverId), eq(communityMembers.userId, ctx.user.id)))
                .limit(1);
            if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member" });

            // Lazily create the meeting; guard the concurrent first-join race.
            let meetingId = channel.mediaMeetingId;
            if (!meetingId) {
                const created = await createMeeting(`#${channel.name}`);
                const [won] = await db
                    .update(communityChannels)
                    .set({ mediaMeetingId: created })
                    .where(and(eq(communityChannels.id, input.channelId), isNull(communityChannels.mediaMeetingId)))
                    .returning({ id: communityChannels.mediaMeetingId });
                if (won?.id) {
                    meetingId = won.id;
                } else {
                    const [fresh] = await db
                        .select({ id: communityChannels.mediaMeetingId })
                        .from(communityChannels)
                        .where(eq(communityChannels.id, input.channelId))
                        .limit(1);
                    meetingId = fresh?.id ?? created;
                }
            }

            const authToken = await addParticipant(meetingId, {
                name: ctx.user.name ?? "Guest",
                presetName: REALTIMEKIT_PRESETS.speaker,
                customParticipantId: ctx.user.id,
            });

            const [srv] = await db
                .select({
                    inactiveChannelId: communityServers.inactiveChannelId,
                    inactiveTimeoutMinutes: communityServers.inactiveTimeoutMinutes,
                })
                .from(communityServers)
                .where(eq(communityServers.id, channel.serverId))
                .limit(1);

            return {
                enabled: true as const,
                authToken,
                canVideo: channel.type === "VIDEO",
                // Voice AFK config for the client-side idle watchdog
                inactiveTimeoutMinutes: srv?.inactiveTimeoutMinutes ?? null,
                inactiveChannelId: srv?.inactiveChannelId ?? null,
            };
        }),

    // ─── Invite links (multiple, with uses/expiry) ───────

    /** All invite links for a server (admin/mod) */
    listInvites: protectedProcedure
        .input(z.object({ serverId: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN", "MODERATOR");
            const rows = await db
                .select({
                    id: communityInvites.id,
                    code: communityInvites.code,
                    maxUses: communityInvites.maxUses,
                    uses: communityInvites.uses,
                    expiresAt: communityInvites.expiresAt,
                    createdAt: communityInvites.createdAt,
                    creatorName: user.name,
                })
                .from(communityInvites)
                .leftJoin(user, eq(communityInvites.createdBy, user.id))
                .where(eq(communityInvites.serverId, input.serverId))
                .orderBy(desc(communityInvites.createdAt));
            return rows;
        }),

    /** Create an invite link with optional uses/expiry (admin/mod) */
    createInvite: protectedProcedure
        .input(z.object({
            serverId: z.string().uuid(),
            maxUses: z.number().int().positive().max(10_000).nullable().optional(),
            expiresInHours: z.number().int().positive().max(24 * 30).nullable().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN", "MODERATOR");

            const [{ n }] = await db
                .select({ n: count() })
                .from(communityInvites)
                .where(eq(communityInvites.serverId, input.serverId));
            if (Number(n) >= 50) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Servers can have up to 50 invite links" });
            }

            const [created] = await db
                .insert(communityInvites)
                .values({
                    serverId: input.serverId,
                    code: nanoid(8),
                    createdBy: ctx.user.id,
                    maxUses: input.maxUses ?? null,
                    expiresAt: input.expiresInHours
                        ? new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000)
                        : null,
                })
                .returning();
            await logAudit(input.serverId, ctx.user.id, "invite.create", "created an invite link");
            return created;
        }),

    /** Revoke one invite link (admin/mod) */
    deleteInvite: protectedProcedure
        .input(z.object({ serverId: z.string().uuid(), inviteId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN", "MODERATOR");
            await db
                .delete(communityInvites)
                .where(and(eq(communityInvites.id, input.inviteId), eq(communityInvites.serverId, input.serverId)));
            await logAudit(input.serverId, ctx.user.id, "invite.delete", "revoked an invite link");
            return { success: true };
        }),

    /** Accept the server rules (unlocks chatting when rules are required) */
    agreeToRules: protectedProcedure
        .input(z.object({ serverId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            const [updated] = await db
                .update(communityMembers)
                .set({ rulesAgreedAt: new Date(), updatedAt: new Date() })
                .where(and(eq(communityMembers.serverId, input.serverId), eq(communityMembers.userId, ctx.user.id)))
                .returning();
            if (!updated) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member" });
            return { agreed: true };
        }),

    /**
     * Generate (or return) the server's template code — a link that pre-fills
     * a NEW server with this one's channels + settings (never messages,
     * members, or expressions).
     */
    generateTemplate: protectedProcedure
        .input(z.object({ serverId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN");
            const [srv] = await db
                .select({ templateCode: communityServers.templateCode })
                .from(communityServers)
                .where(eq(communityServers.id, input.serverId))
                .limit(1);
            if (srv?.templateCode) return { templateCode: srv.templateCode };

            const code = nanoid(10);
            await db.update(communityServers)
                .set({ templateCode: code, updatedAt: new Date() })
                .where(eq(communityServers.id, input.serverId));
            await logAudit(input.serverId, ctx.user.id, "server.template", "generated a server template");
            return { templateCode: code };
        }),

    /** What a template link creates — name + channel list preview */
    getTemplatePreview: protectedProcedure
        .input(z.object({ templateCode: z.string().min(1) }))
        .query(async ({ input }) => {
            const [srv] = await db
                .select({ id: communityServers.id, name: communityServers.name, description: communityServers.description })
                .from(communityServers)
                .where(eq(communityServers.templateCode, input.templateCode))
                .limit(1);
            if (!srv) throw new TRPCError({ code: "NOT_FOUND", message: "This template link is invalid" });
            const channels = await db
                .select({ name: communityChannels.name, type: communityChannels.type })
                .from(communityChannels)
                .where(eq(communityChannels.serverId, srv.id))
                .orderBy(sql`${communityChannels.position} ASC NULLS LAST`, asc(communityChannels.createdAt));
            return { name: srv.name, description: srv.description, channels };
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
                categoryId: z.string().uuid().optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN", "MODERATOR");

            if (input.categoryId) {
                const [cat] = await db
                    .select({ id: communityChannelCategories.id })
                    .from(communityChannelCategories)
                    .where(and(eq(communityChannelCategories.id, input.categoryId), eq(communityChannelCategories.serverId, input.serverId)))
                    .limit(1);
                if (!cat) throw new TRPCError({ code: "NOT_FOUND", message: "Category not found" });
            }

            const [channel] = await db
                .insert(communityChannels)
                .values({
                    name: input.name.toLowerCase().replace(/\s+/g, "-"),
                    type: input.type,
                    serverId: input.serverId,
                    createdById: ctx.user.id,
                    categoryId: input.categoryId ?? null,
                })
                .returning();

            await logAudit(input.serverId, ctx.user.id, "channel.create", `created #${channel.name}`);
            return channel;
        }),

    // ─── Channel categories (Discord-style sidebar groups) ───

    /** Create a category (admin/mod) */
    createCategory: protectedProcedure
        .input(z.object({ serverId: z.string().uuid(), name: z.string().min(1).max(50) }))
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN", "MODERATOR");

            const [{ maxPos }] = await db
                .select({ maxPos: sql<number | null>`MAX(${communityChannelCategories.position})` })
                .from(communityChannelCategories)
                .where(eq(communityChannelCategories.serverId, input.serverId));

            const [created] = await db
                .insert(communityChannelCategories)
                .values({
                    serverId: input.serverId,
                    name: input.name.trim(),
                    position: (maxPos ?? -1) + 1,
                })
                .returning();

            await logAudit(input.serverId, ctx.user.id, "category.create", `created category ${created.name}`);
            return created;
        }),

    /** Rename a category (admin/mod) */
    renameCategory: protectedProcedure
        .input(z.object({ serverId: z.string().uuid(), categoryId: z.string().uuid(), name: z.string().min(1).max(50) }))
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN", "MODERATOR");

            const [updated] = await db
                .update(communityChannelCategories)
                .set({ name: input.name.trim() })
                .where(and(eq(communityChannelCategories.id, input.categoryId), eq(communityChannelCategories.serverId, input.serverId)))
                .returning();
            if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Category not found" });

            await logAudit(input.serverId, ctx.user.id, "category.rename", `renamed category to ${updated.name}`);
            return updated;
        }),

    /** Delete a category — its channels are ungrouped, never deleted (admin/mod) */
    deleteCategory: protectedProcedure
        .input(z.object({ serverId: z.string().uuid(), categoryId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN", "MODERATOR");

            const [removed] = await db
                .delete(communityChannelCategories)
                .where(and(eq(communityChannelCategories.id, input.categoryId), eq(communityChannelCategories.serverId, input.serverId)))
                .returning();
            if (removed) {
                await logAudit(input.serverId, ctx.user.id, "category.delete", `deleted category ${removed.name}`);
            }
            return { success: true };
        }),

    // (moving a channel between categories = updateChannel's categoryId)

    // ─── Incoming webhooks (Integrations) ────────────────

    /** List a server's webhooks, tokens included for URL display (admin/mod) */
    listWebhooks: protectedProcedure
        .input(z.object({ serverId: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN", "MODERATOR");

            return db
                .select({
                    id: communityWebhooks.id,
                    channelId: communityWebhooks.channelId,
                    name: communityWebhooks.name,
                    avatarUrl: communityWebhooks.avatarUrl,
                    token: communityWebhooks.token,
                    lastUsedAt: communityWebhooks.lastUsedAt,
                    createdAt: communityWebhooks.createdAt,
                    channelName: communityChannels.name,
                })
                .from(communityWebhooks)
                .innerJoin(communityChannels, eq(communityWebhooks.channelId, communityChannels.id))
                .where(eq(communityWebhooks.serverId, input.serverId))
                .orderBy(desc(communityWebhooks.createdAt));
        }),

    /** Create an incoming webhook for a text channel (admin/mod) */
    createWebhook: protectedProcedure
        .input(z.object({
            serverId: z.string().uuid(),
            channelId: z.string().uuid(),
            name: z.string().min(1).max(50),
        }))
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN", "MODERATOR");

            const [channel] = await db
                .select({ id: communityChannels.id, type: communityChannels.type })
                .from(communityChannels)
                .where(and(eq(communityChannels.id, input.channelId), eq(communityChannels.serverId, input.serverId)))
                .limit(1);
            if (!channel) throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found" });
            if (channel.type !== "TEXT") throw new TRPCError({ code: "BAD_REQUEST", message: "Webhooks post into text channels" });

            const [created] = await db
                .insert(communityWebhooks)
                .values({
                    serverId: input.serverId,
                    channelId: input.channelId,
                    name: input.name.trim(),
                    token: nanoid(64),
                    createdBy: ctx.user.id,
                })
                .returning();

            await logAudit(input.serverId, ctx.user.id, "webhook.create", `created webhook ${created.name}`);
            return created;
        }),

    /** Delete a webhook — its past messages stay (admin/mod) */
    deleteWebhook: protectedProcedure
        .input(z.object({ serverId: z.string().uuid(), webhookId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN", "MODERATOR");

            const [removed] = await db
                .delete(communityWebhooks)
                .where(and(eq(communityWebhooks.id, input.webhookId), eq(communityWebhooks.serverId, input.serverId)))
                .returning();
            if (removed) {
                await logAudit(input.serverId, ctx.user.id, "webhook.delete", `deleted webhook ${removed.name}`);
            }
            return { success: true };
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
                categoryId: z.string().uuid().nullable().optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN", "MODERATOR");

            if (input.categoryId) {
                const [cat] = await db
                    .select({ id: communityChannelCategories.id })
                    .from(communityChannelCategories)
                    .where(and(eq(communityChannelCategories.id, input.categoryId), eq(communityChannelCategories.serverId, input.serverId)))
                    .limit(1);
                if (!cat) throw new TRPCError({ code: "NOT_FOUND", message: "Category not found" });
            }

            const [updated] = await db
                .update(communityChannels)
                .set({
                    ...(input.name && { name: input.name.toLowerCase().replace(/\s+/g, "-") }),
                    ...(input.type && { type: input.type }),
                    ...(input.readOnly !== undefined && { readOnly: input.readOnly }),
                    ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
                    updatedAt: new Date(),
                })
                // Scope to the role-checked server — the id alone would let an
                // admin of one server edit another server's channels.
                .where(and(eq(communityChannels.id, input.channelId), eq(communityChannels.serverId, input.serverId)))
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
            await require2faIfEnforced(input.serverId, ctx.user.id);

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
            const after = keysetAfter(communityMessages.createdAt, communityMessages.id, parseKeysetCursor(input.cursor, "date"));
            if (after) conditions.push(after);

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
                    // Webhook messages have no member/user — coalesce into the
                    // shape the chat UI already renders.
                    memberRole: sql<string>`COALESCE(${communityMembers.role}, 'GUEST')`,
                    userId: sql<string>`COALESCE(${communityMembers.userId}, '')`,
                    userName: sql<string>`COALESCE(${communityMembers.nickname}, ${user.name}, ${communityMessages.webhookName}, 'Webhook')`,
                    userImage: sql<string | null>`COALESCE(${user.avatar_url}, ${communityMessages.webhookAvatar})`,
                    userUsername: user.username,
                    // "APP" badge: webhook-authored rows AND bot-user-authored
                    // rows (bot.sendMessage / coin alerts) — both are automated
                    // authors, same Discord-style marker.
                    isWebhook: sql<boolean>`(${communityMessages.webhookName} IS NOT NULL OR COALESCE(${user.isBot}, false))`,
                    replyContent: replyMsg.content,
                    replyDeleted: replyMsg.deleted,
                    replyUserName: sql<string | null>`COALESCE(${replyMember.nickname}, ${replyUser.name}, ${replyMsg.webhookName})`,
                })
                .from(communityMessages)
                .leftJoin(communityMembers, eq(communityMessages.memberId, communityMembers.id))
                .leftJoin(user, eq(communityMembers.userId, user.id))
                .leftJoin(replyMsg, eq(communityMessages.replyToId, replyMsg.id))
                .leftJoin(replyMember, eq(replyMsg.memberId, replyMember.id))
                .leftJoin(replyUser, eq(replyMember.userId, replyUser.id))
                .where(and(...conditions))
                .orderBy(desc(communityMessages.createdAt), asc(communityMessages.id))
                .limit(input.limit + 1);

            const page = takePage(msgs, input.limit);
            const msgsPage = page.items;
            const nextCursor = page.hasMore
                ? encodeKeysetCursor(page.lastItem!.createdAt, page.lastItem!.id)
                : undefined;

            // Reactions for this page, aggregated per message+emoji with
            // whether the current member reacted.
            const ids = msgsPage.map((m) => m.id);
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

            // Custom-role name colors for this page's authors (highest role wins)
            const roleColorByMember = new Map<string, string>();
            const memberIds = [...new Set(msgsPage.map((m) => m.memberId).filter((id): id is string => !!id))];
            if (memberIds.length) {
                const colorRows = await db
                    .select({
                        memberId: communityMemberRoles.memberId,
                        color: communityRoles.color,
                        position: communityRoles.position,
                    })
                    .from(communityMemberRoles)
                    .innerJoin(communityRoles, eq(communityMemberRoles.roleId, communityRoles.id))
                    .where(inArray(communityMemberRoles.memberId, memberIds))
                    .orderBy(sql`${communityRoles.position} ASC NULLS LAST`);
                for (const r of colorRows) {
                    if (!roleColorByMember.has(r.memberId)) roleColorByMember.set(r.memberId, r.color);
                }
            }

            return {
                items: msgsPage.map((m) => ({
                    ...m,
                    reactions: reactionsByMessage.get(m.id) ?? [],
                    roleColor: (m.memberId && roleColorByMember.get(m.memberId)) || null,
                })),
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
                        automodFlaggedWords: communityServers.automodFlaggedWords,
                        verificationLevel: communityServers.verificationLevel,
                        rulesRequired: communityServers.rulesRequired,
                        rules: communityServers.rules,
                    })
                    .from(communityServers)
                    .where(eq(communityServers.id, channel[0].serverId))
                    .limit(1);

                // Server rules gate: members must agree before chatting.
                if (srv?.rulesRequired && srv.rules && !member[0].rulesAgreedAt) {
                    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Agree to the server rules before chatting" });
                }

                // Verification level: posting requirements for regular members.
                // low = account 10+ min old · medium = account 1+ day old ·
                // high = medium AND a server member for 10+ minutes.
                if (srv?.verificationLevel && srv.verificationLevel !== "none") {
                    const TEN_MIN = 10 * 60 * 1000;
                    const ONE_DAY = 24 * 60 * 60 * 1000;
                    const [me] = await db.select({ createdAt: user.createdAt }).from(user).where(eq(user.id, ctx.user.id)).limit(1);
                    const accountAge = Date.now() - (me?.createdAt?.getTime() ?? Date.now());
                    const memberAge = Date.now() - member[0].createdAt.getTime();
                    if (srv.verificationLevel === "low" && accountAge < TEN_MIN) {
                        throw new TRPCError({ code: "FORBIDDEN", message: "Your account is too new to post here yet — try again in a few minutes" });
                    }
                    if (srv.verificationLevel === "medium" && accountAge < ONE_DAY) {
                        throw new TRPCError({ code: "FORBIDDEN", message: "This server requires accounts to be at least a day old to post" });
                    }
                    if (srv.verificationLevel === "high" && (accountAge < ONE_DAY || memberAge < TEN_MIN)) {
                        throw new TRPCError({ code: "FORBIDDEN", message: "This server requires a day-old account and 10 minutes of membership to post" });
                    }
                }

                const blocked = parseKeywords(srv?.automodKeywords);
                const lower = input.content.toLowerCase();
                if (blocked.some((w) => lower.includes(w))) {
                    throw new TRPCError({ code: "BAD_REQUEST", message: "Message blocked by this server's AutoMod" });
                }
                if (srv?.automodFlaggedWords && FLAGGED_WORDS.some((w) => lower.includes(w))) {
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
            // Check if current user is admin/mod OR the message owner.
            // Left join: webhook messages have no member, but mods can delete them.
            const msg = await db
                .select({
                    id: communityMessages.id,
                    userId: communityMembers.userId,
                })
                .from(communityMessages)
                .leftJoin(communityMembers, eq(communityMessages.memberId, communityMembers.id))
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
                .set({ deleted: true, content: DELETED_MESSAGE_TEXT, fileUrl: null, updatedAt: new Date() })
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
