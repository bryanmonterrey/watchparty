import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../trpc";
import { db } from "@/db";
import { streams } from "@/db/schema/content/stream";
import { user } from "@/db/schema/auth/user";
import { and, eq, desc, inArray, ne, sql } from "drizzle-orm";
import { dispatchDeveloperEvent } from "@/lib/developer/webhooks";
import { follows } from "@/db/schema/content/follow";
import { effectiveVerifiedTier } from "@/lib/verified-tier";
import { TRPCError } from "@trpc/server";
import type { IvsClient } from "@aws-sdk/client-ivs";
import { nanoid } from "nanoid";
import { tokens } from "@/db/schema/content/token";
import { creatorModerators, vipMembers } from "@/db/schema/content/creator";
import { publishToRoom } from "@/lib/realtime/publish";
import { giftSubscriptions } from "@/db/schema/content/subscription";
import { evaluateChatGate } from "@/lib/chat/gate";
import { count as sqlCount, gte } from "drizzle-orm";
import { rooms } from "@/lib/realtime/protocol";
import { subscriptions } from "@/db/schema/content/subscription";

const region = process.env.AWS_REGION ?? "us-east-1";

/** Standing in a channel's chat, strongest first. Absent = plain viewer. */
export type ChatRole = "host" | "moderator" | "vip" | "subscriber";

/**
 * Start and reset time for a leaderboard window.
 *
 * UTC-aligned, so every viewer of a channel sees the same board and the same
 * countdown regardless of where they are — a board that resets at local
 * midnight would rank different people for different people. Weeks start
 * Monday. Lifetime has no bound and never resets.
 */
/** Shared by the gate query and the two mod-only mutations. */
async function isChannelModerator(creatorId: string, userId: string): Promise<boolean> {
    if (creatorId === userId) return true;
    const rows = await db.select({ id: creatorModerators.id })
        .from(creatorModerators)
        .where(and(eq(creatorModerators.creatorId, creatorId), eq(creatorModerators.moderatorId, userId)))
        .limit(1);
    return rows.length > 0;
}

function periodWindow(period: "weekly" | "monthly" | "yearly" | "lifetime") {
    const now = new Date();
    if (period === "lifetime") return { start: null, resetsAt: null };

    if (period === "weekly") {
        const day = now.getUTCDay();
        // getUTCDay() is 0 for Sunday, which is 6 days INTO a Monday week.
        const since = day === 0 ? 6 : day - 1;
        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - since));
        const resetsAt = new Date(start.getTime() + 7 * 864e5);
        return { start, resetsAt };
    }

    if (period === "monthly") {
        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const resetsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
        return { start, resetsAt };
    }

    const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const resetsAt = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1));
    return { start, resetsAt };
}

// The AWS SDKs are heavy, and this router rides into every tRPC isolate via
// the appRouter graph — load them only when an IVS procedure actually runs
// (Workers OOM headroom; eager imports here cost every request the SDK heap).
function ivsSdk() {
    return import("@aws-sdk/client-ivs");
}

function ivsChatSdk() {
    return import("@aws-sdk/client-ivschat");
}

async function ivsClient() {
    const { IvsClient } = await ivsSdk();
    return new IvsClient({
        region,
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
    });
}

async function ivsChatClient() {
    const { IvschatClient } = await ivsChatSdk();
    return new IvschatClient({
        region,
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
    });
}

async function getOrCreateRecordingConfig(ivs: IvsClient) {
    const bucket = process.env.AWS_IVS_RECORDINGS_BUCKET;
    if (!bucket) return undefined;
    try {
        const { ListRecordingConfigurationsCommand, CreateRecordingConfigurationCommand } = await ivsSdk();
        const list = await ivs.send(new ListRecordingConfigurationsCommand({}));
        const existing = list.recordingConfigurations?.find(
            c => c.destinationConfiguration?.s3?.bucketName === bucket
        );
        if (existing?.arn) return existing.arn;
        const created = await ivs.send(new CreateRecordingConfigurationCommand({
            name: "watchparty-recordings",
            destinationConfiguration: { s3: { bucketName: bucket } },
        }));
        return created.recordingConfiguration?.arn;
    } catch {
        return undefined;
    }
}

// Live viewer counts: IVS GetStream is a poll API (counts refresh ~1/min at
// AWS), so watch pages poll our cached query instead of hammering AWS. One
// entry per channel, shared by every viewer on this isolate.
const VIEWERS_TTL_MS = 20_000;
const viewersCache = new Map<string, { data: { isLive: boolean; viewerCount: number }; exp: number }>();

async function fetchLiveViewers(channelArn: string): Promise<{ isLive: boolean; viewerCount: number }> {
    const cached = viewersCache.get(channelArn);
    if (cached && cached.exp > Date.now()) return cached.data;

    let data: { isLive: boolean; viewerCount: number };
    try {
        const { GetStreamCommand } = await ivsSdk();
        const res = await (await ivsClient()).send(new GetStreamCommand({ channelArn }));
        data = { isLive: true, viewerCount: res.stream?.viewerCount ?? 0 };
    } catch (err) {
        // ChannelNotBroadcasting = definitively offline; anything else, don't guess
        if ((err as { name?: string })?.name === "ChannelNotBroadcasting") {
            data = { isLive: false, viewerCount: 0 };
        } else {
            throw err;
        }
    }
    viewersCache.set(channelArn, { data, exp: Date.now() + VIEWERS_TTL_MS });

    // Write-through so browse surfaces (feed, discover) stay fresh too
    await db.update(streams)
        .set({ isLive: data.isLive, viewerCount: data.viewerCount, updatedAt: new Date() })
        .where(eq(streams.channelArn, channelArn))
        .catch(() => {});

    return data;
}

export const streamRouter = router({
    // Get stream config for a user (by userId or username)
    getByUserId: publicProcedure
        .input(z.object({ userId: z.string() }))
        .query(async ({ input }) => {
            const row = await db.select().from(streams).where(eq(streams.userId, input.userId)).limit(1);
            return row[0] ?? null;
        }),

    getByUsername: publicProcedure
        .input(z.object({ username: z.string() }))
        .query(async ({ input }) => {
            const [u] = await db.select({ id: user.id }).from(user).where(eq(user.username, input.username)).limit(1);
            if (!u) return null;
            const row = await db.select().from(streams).where(eq(streams.userId, u.id)).limit(1);
            return row[0] ?? null;
        }),

    // Live viewer count for a host — watch pages poll this (~30s interval)
    getViewers: publicProcedure
        .input(z.object({ userId: z.string() }))
        .query(async ({ input }) => {
            const [row] = await db
                .select({ channelArn: streams.channelArn, isLive: streams.isLive, viewerCount: streams.viewerCount })
                .from(streams)
                .where(eq(streams.userId, input.userId))
                .limit(1);
            if (!row?.channelArn) return { isLive: false, viewerCount: 0 };
            try {
                return await fetchLiveViewers(row.channelArn);
            } catch {
                // AWS hiccup — fall back to the last known DB state
                return { isLive: row.isLive, viewerCount: row.viewerCount };
            }
        }),

    // Currently-live streams with their host, most-watched first. Powers the
    // "Live on watchparty" discover right-rail card.
    listLive: publicProcedure
        .input(z.object({ limit: z.number().min(1).max(12).default(6) }).optional())
        .query(async ({ input }) => {
            const rows = await db
                .select({
                    userId: streams.userId,
                    title: streams.title,
                    category: streams.category,
                    viewerCount: streams.viewerCount,
                    name: user.name,
                    username: user.username,
                    avatar_url: user.avatar_url,
                    verifiedTier: effectiveVerifiedTier(user.verifiedTier, user.hideVerifiedBadge),
                })
                .from(streams)
                .innerJoin(user, eq(streams.userId, user.id))
                .where(eq(streams.isLive, true))
                .orderBy(desc(streams.viewerCount))
                .limit(input?.limit ?? 6);
            return rows;
        }),

    // The viewer's followed channels with their live state — the rail's Online
    // tab. Live first (most-watched on top), then offline by follow recency.
    // LEFT join: someone who has never configured a stream still shows up, as
    // offline — the tab is "who I follow", not "who has a channel row".
    followedChannels: protectedProcedure
        .input(z.object({ limit: z.number().min(1).max(50).default(40) }).optional())
        .query(async ({ ctx, input }) => {
            const rows = await db
                .select({
                    userId: user.id,
                    name: user.name,
                    username: user.username,
                    avatar_url: user.avatar_url,
                    verifiedTier: effectiveVerifiedTier(user.verifiedTier, user.hideVerifiedBadge),
                    isLive: sql<boolean>`coalesce(${streams.isLive}, false)`,
                    category: streams.category,
                    viewerCount: sql<number>`coalesce(${streams.viewerCount}, 0)`,
                })
                .from(follows)
                .innerJoin(user, eq(follows.followingId, user.id))
                .leftJoin(streams, eq(streams.userId, user.id))
                .where(eq(follows.followerId, ctx.user.id))
                .orderBy(
                    desc(sql`coalesce(${streams.isLive}, false)`),
                    desc(sql`coalesce(${streams.viewerCount}, 0)`),
                    desc(follows.createdAt),
                )
                .limit(input?.limit ?? 40);
            return rows;
        }),

    /**
     * Start broadcasting: commit the setup and mint the stream's coin.
     *
     * This does NOT push video — ingest is RTMP, so frames start when the
     * encoder connects and the IVS webhook flips isLive. What this owns is
     * everything that must be true BEFORE that happens: a title, and the coin
     * created from the ticker chosen in setup.
     *
     * The coin is created HERE rather than when the ticker was typed, which is
     * the whole reason streams.ticker and streams.token_id are separate columns:
     * a stream that gets configured and never goes live should leave no draft
     * coin behind for a broadcast that never happened.
     *
     * ANYONE can later launch this coin — first buy IS the launch, same as a
     * post's. That's deliberately unlike a creator coin, which only its creator
     * may launch (see trade.createCreatorCoin).
     *
     * Idempotent: pressing it twice returns the existing coin instead of
     * minting a second one.
     */
    startBroadcast: protectedProcedure.mutation(async ({ ctx }) => {
        const [stream] = await db
            .select()
            .from(streams)
            .where(eq(streams.userId, ctx.user.id))
            .limit(1);

        if (!stream) {
            throw new TRPCError({ code: "NOT_FOUND", message: "No stream configured" });
        }
        if (!stream.title?.trim()) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Give your stream a title first" });
        }
        if (!stream.serverUrl || !stream.streamKey) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Generate your stream connection first" });
        }

        // Already has one — pressing start again must not mint a second coin.
        if (stream.tokenId) return { tokenId: stream.tokenId, created: false };
        if (!stream.ticker?.trim()) return { tokenId: null, created: false };

        const tokenId = nanoid();
        await db.insert(tokens).values({
            id: tokenId,
            ticker: stream.ticker.trim().toUpperCase(),
            name: stream.title.trim().slice(0, 32),
            description: stream.title.trim(),
            // Server-resolved, like every other coin here: one that mints
            // imageless keeps it forever.
            imageUrl: ctx.user.avatar_url ?? undefined,
            status: "draft",
            earningsEnabled: true,
            creatorId: ctx.user.id,
        });

        await db.update(streams).set({ tokenId, updatedAt: new Date() }).where(eq(streams.userId, ctx.user.id));

        return { tokenId, created: true };
    }),

    // Get current user's stream config
    getMine: protectedProcedure.query(async ({ ctx }) => {
        const row = await db.select().from(streams).where(eq(streams.userId, ctx.user.id)).limit(1);
        return row[0] ?? null;
    }),

    // Generate/reset IVS channel + stream key
    generateConnection: protectedProcedure
        .input(z.object({ ingressType: z.enum(["RTMP", "WHIP"]).default("RTMP") }))
        .mutation(async ({ ctx, input }) => {
            const { ListChannelsCommand, GetChannelCommand, ListStreamKeysCommand, GetStreamKeyCommand, CreateChannelCommand } = await ivsSdk();
            const { CreateRoomCommand } = await ivsChatSdk();
            const ivs = await ivsClient();
            const chat = await ivsChatClient();

            // Check for existing channel
            const listRes = await ivs.send(new ListChannelsCommand({ maxResults: 50 }));
            const existingChannel = listRes.channels?.find(c => c.name === ctx.user.id);

            let channelArn: string;
            let ingestEndpoint: string;
            let playbackUrl: string | undefined;
            let streamKeyValue: string;
            let chatRoomArn: string | undefined;

            if (existingChannel?.arn) {
                // Reuse existing channel
                const fullCh = await ivs.send(new GetChannelCommand({ arn: existingChannel.arn }));
                channelArn = fullCh.channel!.arn!;
                ingestEndpoint = fullCh.channel!.ingestEndpoint!;
                playbackUrl = fullCh.channel!.playbackUrl;

                const keysList = await ivs.send(new ListStreamKeysCommand({ channelArn, maxResults: 1 }));
                const keySummary = keysList.streamKeys?.[0];
                if (keySummary?.arn) {
                    const keyRes = await ivs.send(new GetStreamKeyCommand({ arn: keySummary.arn }));
                    streamKeyValue = keyRes.streamKey!.value!;
                } else {
                    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Stream key not found" });
                }
            } else {
                // Create new channel
                const recordingArn = await getOrCreateRecordingConfig(ivs);
                const created = await ivs.send(new CreateChannelCommand({
                    name: ctx.user.id,
                    type: "STANDARD",
                    latencyMode: "LOW",
                    ...(recordingArn ? { recordingConfigurationArn: recordingArn } : {}),
                }));
                if (!created.channel?.arn || !created.channel.ingestEndpoint || !created.streamKey?.value) {
                    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Channel creation failed" });
                }
                channelArn = created.channel.arn;
                ingestEndpoint = created.channel.ingestEndpoint;
                playbackUrl = created.channel.playbackUrl;
                streamKeyValue = created.streamKey.value;

                // Create chat room
                const room = await chat.send(new CreateRoomCommand({ name: `${ctx.user.id}-chat` }));
                chatRoomArn = room.arn;
            }

            // Build server URL
            let serverUrl = ingestEndpoint;
            if (input.ingressType === "WHIP") {
                const host = ingestEndpoint.replace("rtmp://", "").split(":")[0].split("/")[0];
                serverUrl = `https://${host}:443/whip`;
            }

            // Upsert stream record
            const existing = await db.select({ id: streams.id }).from(streams).where(eq(streams.userId, ctx.user.id)).limit(1);
            if (existing[0]) {
                await db.update(streams).set({
                    channelArn,
                    ingressId: channelArn,
                    streamKey: streamKeyValue,
                    serverUrl,
                    playbackUrl: playbackUrl ?? null,
                    ...(chatRoomArn ? { chatRoomArn } : {}),
                    updatedAt: new Date(),
                }).where(eq(streams.userId, ctx.user.id));
            } else {
                await db.insert(streams).values({
                    id: nanoid(),
                    userId: ctx.user.id,
                    channelArn,
                    ingressId: channelArn,
                    streamKey: streamKeyValue,
                    serverUrl,
                    playbackUrl: playbackUrl ?? null,
                    chatRoomArn: chatRoomArn ?? null,
                    isLive: false,
                });
            }

            return { serverUrl, streamKey: streamKeyValue, playbackUrl: playbackUrl ?? null };
        }),

    // Update stream metadata
    updateInfo: protectedProcedure
        .input(z.object({
            title: z.string().max(100).optional(),
            category: z.string().max(50).optional(),
            // The stream's coin ticker. Intent only — the coin itself is
            // created when the broadcast starts.
            ticker: z.string().max(16).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            await db.update(streams).set({ ...input, updatedAt: new Date() }).where(eq(streams.userId, ctx.user.id));
            return { success: true };
        }),

    // Get a chat token for the viewer (calls IVS Chat)
    getChatToken: publicProcedure
        .input(z.object({ hostUserId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const [streamRow] = await db.select({ chatRoomArn: streams.chatRoomArn })
                .from(streams).where(eq(streams.userId, input.hostUserId)).limit(1);
            if (!streamRow?.chatRoomArn) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Chat room not found" });
            }
            const viewer = (ctx as { user?: { id: string; username?: string } }).user;
            const viewerId = viewer?.id ?? `guest-${nanoid(8)}`;
            const viewerName = viewer?.username ?? `Guest${Math.floor(Math.random() * 9999)}`;
            const { CreateChatTokenCommand } = await ivsChatSdk();
            const chat = await ivsChatClient();
            const res = await chat.send(new CreateChatTokenCommand({
                roomIdentifier: streamRow.chatRoomArn,
                userId: viewerId,
                attributes: { username: viewerName },
                capabilities: ["SEND_MESSAGE"],
                sessionDurationInMinutes: 180,
            }));
            return {
                token: res.token!,
                sessionExpirationTime: res.sessionExpirationTime!,
                chatRoomArn: streamRow.chatRoomArn,
            };
        }),

    // Webhook-style: mark live/offline (called from AWS EventBridge or your webhook handler)
    setLiveStatus: protectedProcedure
        .input(z.object({ isLive: z.boolean() }))
        .mutation(async ({ ctx, input }) => {
            // The ne() guard makes this a real transition or a no-op, so the
            // developer webhook can't re-fire from same-state calls.
            const rows = await db.update(streams)
                .set({ isLive: input.isLive, updatedAt: new Date() })
                .where(and(eq(streams.userId, ctx.user.id), ne(streams.isLive, input.isLive)))
                .returning({ id: streams.id });
            for (const row of rows) {
                await dispatchDeveloperEvent(ctx.user.id, input.isLive ? "stream.online" : "stream.offline", {
                    streamId: row.id,
                    sessionId: null,
                });
            }
            return { success: true };
        }),

    /**
     * Standing of each given user in a channel, for the chat member list.
     *
     * Takes the ids rather than deriving them, because the roster comes from the
     * realtime DO (who is CONNECTED) and the database only knows who holds a
     * role — neither half can answer "who is in here, ranked" alone.
     *
     * Returns only users who hold something. Anyone absent is a plain viewer,
     * which is most of a chat, so saying so per-id would be the bulk of the
     * payload for no information.
     *
     * protected, not public: this reports subscriber and VIP standing for
     * arbitrary ids, and every caller is signed in anyway (the chat lives inside
     * the authenticated app shell), so there's no reason to answer strangers.
     */
    chatRoles: protectedProcedure
        .input(z.object({
            creatorId: z.string(),
            // Capped: this is three indexed IN-lookups, and a roster longer than
            // this is a scrolling problem before it's a query problem.
            userIds: z.array(z.string()).max(200),
        }))
        .query(async ({ input }) => {
            const { creatorId, userIds } = input;
            if (userIds.length === 0) return {} as Record<string, ChatRole>;

            const [mods, vips, subs] = await Promise.all([
                db.select({ id: creatorModerators.moderatorId })
                    .from(creatorModerators)
                    .where(and(eq(creatorModerators.creatorId, creatorId), inArray(creatorModerators.moderatorId, userIds))),
                db.select({ id: vipMembers.memberId })
                    .from(vipMembers)
                    .where(and(eq(vipMembers.creatorId, creatorId), inArray(vipMembers.memberId, userIds))),
                db.select({ id: subscriptions.subscriberId })
                    .from(subscriptions)
                    .where(and(
                        eq(subscriptions.creatorId, creatorId),
                        eq(subscriptions.status, "active"),
                        inArray(subscriptions.subscriberId, userIds),
                    )),
            ]);

            // Assigned weakest-first so a stronger role overwrites: someone can
            // be a subscriber AND a mod, and they should read as a mod.
            const roles: Record<string, ChatRole> = {};
            for (const r of subs) roles[r.id] = "subscriber";
            for (const r of vips) roles[r.id] = "vip";
            for (const r of mods) roles[r.id] = "moderator";
            if (userIds.includes(creatorId)) roles[creatorId] = "host";
            return roles;
        }),

    /**
     * Pin a chat line for the channel, or clear the pin with `messageId: null`.
     *
     * Authorisation lives here because the Durable Object has no database — it
     * can't know who moderates a channel. The DO does the opposite half: it
     * resolves the id against room history, so a moderator chooses WHICH
     * message is pinned and never what it says or whose name is on it. Neither
     * side is trusted with the other's job.
     */
    pinChatMessage: protectedProcedure
        .input(z.object({ creatorId: z.string(), messageId: z.string().nullable() }))
        .mutation(async ({ ctx, input }) => {
            const { creatorId, messageId } = input;

            if (ctx.user.id !== creatorId) {
                const mod = await db.select({ id: creatorModerators.id })
                    .from(creatorModerators)
                    .where(and(
                        eq(creatorModerators.creatorId, creatorId),
                        eq(creatorModerators.moderatorId, ctx.user.id),
                    ))
                    .limit(1);
                if (!mod.length) {
                    throw new TRPCError({ code: "FORBIDDEN", message: "Only the host and moderators can pin" });
                }
            }

            await publishToRoom(rooms.streamChat(creatorId), {
                t: "pin",
                id: messageId,
                by: ctx.user.name ?? "a moderator",
            });
            return { success: true };
        }),

    /**
     * Top gifters for a channel, for the chat leaderboard.
     *
     * Ranked on gift_subscriptions — subs gifted TO this creator's channel —
     * which is the unit the board is denominated in. COUNT of rows, not a sum of
     * durationMonths: gifting one person three months is one sub gifted, and a
     * bulk gift of five is five rows.
     *
     * Windows are calendar-aligned rather than rolling, because the board
     * advertises when it RESETS. A rolling 7 days never resets — everyone's
     * total just decays, and "resets in 4 days" would be a lie.
     */
    topGifters: publicProcedure
        .input(z.object({
            creatorId: z.string(),
            period: z.enum(["weekly", "monthly", "yearly", "lifetime"]).default("weekly"),
            limit: z.number().min(1).max(50).default(10),
        }))
        .query(async ({ ctx, input }) => {
            const { creatorId, period, limit } = input;
            const { start, resetsAt } = periodWindow(period);

            // gte(column, date), never a Date interpolated into sql`` — drizzle
            // needs the column to know it's a timestamptz, and on Workers the
            // raw Date reaches postgres.js and throws (see CLAUDE.md).
            const where = start
                ? and(eq(giftSubscriptions.creatorId, creatorId), gte(giftSubscriptions.createdAt, start))
                : eq(giftSubscriptions.creatorId, creatorId);

            const rows = await db
                .select({
                    userId: giftSubscriptions.senderId,
                    gifts: sqlCount(),
                    name: user.name,
                    username: user.username,
                    avatar_url: user.avatar_url,
                })
                .from(giftSubscriptions)
                .innerJoin(user, eq(giftSubscriptions.senderId, user.id))
                .where(where)
                .groupBy(giftSubscriptions.senderId, user.name, user.username, user.avatar_url)
                .orderBy(desc(sqlCount()))
                .limit(limit);

            const ranked = rows.map((r, i) => ({ ...r, rank: i + 1 }));
            const mine = ctx.user ? ranked.find((r) => r.userId === ctx.user!.id) ?? null : null;

            // What it costs to move up one place — the board's whole call to
            // action. Unranked viewers take the first free spot below the board.
            let target: { rank: number; needed: number } | null = null;
            if (!ctx.user) {
                target = null;
            } else if (!mine) {
                target = { rank: ranked.length + 1, needed: 1 };
            } else if (mine.rank > 1) {
                const above = ranked[mine.rank - 2];
                target = { rank: mine.rank - 1, needed: above.gifts - mine.gifts + 1 };
            }

            return { period, resetsAt: resetsAt?.toISOString() ?? null, rows: ranked, mine, target };
        }),

    /** The channel's chat gate, evaluated for the caller. Drives the lock UI. */
    chatGate: publicProcedure
        .input(z.object({ creatorId: z.string() }))
        .query(async ({ ctx, input }) => {
            const isMod = ctx.user ? await isChannelModerator(input.creatorId, ctx.user.id) : false;
            return evaluateChatGate(input.creatorId, ctx.user?.id ?? null, isMod);
        }),

    /**
     * Host or moderators set who may talk.
     *
     * The mode takes effect on the next CONNECT for anyone already in the room,
     * because entitlement rides in the connection's signed token. Tightening it
     * therefore doesn't silence people mid-session — which is the gentler
     * behaviour anyway, and a mod who wants someone gone has mute and ban.
     */
    setChatMode: protectedProcedure
        .input(z.object({
            creatorId: z.string(),
            mode: z.enum(["everyone", "followers", "subscribers"]),
            // A day is the ceiling; past that "followers only" is really an
            // invite list and should be a different feature.
            followerMinutes: z.number().min(0).max(1440).default(0),
        }))
        .mutation(async ({ ctx, input }) => {
            if (ctx.user.id !== input.creatorId && !(await isChannelModerator(input.creatorId, ctx.user.id))) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Only the host and moderators can change chat mode" });
            }
            await db.update(streams)
                .set({ chatMode: input.mode, chatFollowerMinutes: input.followerMinutes, updatedAt: new Date() })
                .where(eq(streams.userId, input.creatorId));
            return { success: true };
        }),
});
