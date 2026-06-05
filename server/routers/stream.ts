import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../trpc";
import { db } from "@/db";
import { streams } from "@/db/schema/content/stream";
import { user } from "@/db/schema/auth/user";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
    IvsClient,
    CreateChannelCommand,
    DeleteChannelCommand,
    ListChannelsCommand,
    GetChannelCommand,
    ListStreamKeysCommand,
    GetStreamKeyCommand,
    CreateRecordingConfigurationCommand,
    ListRecordingConfigurationsCommand,
} from "@aws-sdk/client-ivs";
import {
    IvschatClient,
    CreateRoomCommand,
    CreateChatTokenCommand,
} from "@aws-sdk/client-ivschat";
import { nanoid } from "nanoid";

const region = process.env.AWS_REGION ?? "us-east-1";

function ivsClient() {
    return new IvsClient({
        region,
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
    });
}

function ivsChatClient() {
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

    // Get current user's stream config
    getMine: protectedProcedure.query(async ({ ctx }) => {
        const row = await db.select().from(streams).where(eq(streams.userId, ctx.user.id)).limit(1);
        return row[0] ?? null;
    }),

    // Generate/reset IVS channel + stream key
    generateConnection: protectedProcedure
        .input(z.object({ ingressType: z.enum(["RTMP", "WHIP"]).default("RTMP") }))
        .mutation(async ({ ctx, input }) => {
            const ivs = ivsClient();
            const chat = ivsChatClient();

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
            const chat = ivsChatClient();
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
