import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../trpc";
import { db } from "@/db";
import { streams } from "@/db/schema/content/stream";
import { user } from "@/db/schema/auth/user";
import { eq, desc } from "drizzle-orm";
import { effectiveVerifiedTier } from "@/lib/verified-tier";
import { TRPCError } from "@trpc/server";
import type { IvsClient } from "@aws-sdk/client-ivs";
import { nanoid } from "nanoid";

const region = process.env.AWS_REGION ?? "us-east-1";

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
            await db.update(streams).set({ isLive: input.isLive, updatedAt: new Date() }).where(eq(streams.userId, ctx.user.id));
            return { success: true };
        }),
});
