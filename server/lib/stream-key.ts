import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { streams } from "@/db/schema/content/stream";

// Rotating a user's IVS stream key.
//
// Separate from server/routers/stream.ts on purpose: this needs to be callable
// from BOTH a tRPC procedure and an assistant tool, and a Route Handler has no
// tRPC ctx to borrow. Keeping the AWS sequence in one place is also the point —
// it is destructive, and two copies would drift.
//
// Note this is a real rotation, unlike `stream.generateConnection`, which
// REUSES the existing key when a channel is already provisioned (it lists keys
// and takes `streamKeys[0]`). "Give me a new key" has to actually invalidate
// the old one or the request has not been honoured.

const region = process.env.AWS_REGION ?? "us-east-1";

// Lazily imported for the same reason as in the stream router: the AWS SDK is
// heavy and this module is reachable from the assistant route.
function ivsSdk() {
    return import("@aws-sdk/client-ivs");
}

export type RotateResult = { ok: true } | { ok: false; error: string };

/**
 * Deletes the user's current IVS stream key and issues a new one.
 *
 * Takes a userId rather than reading any ambient session: every caller must
 * pass an id it has already authenticated, which keeps the authorisation
 * decision at the call site instead of hidden in here.
 *
 * The new key is deliberately NOT returned. Callers re-read it through the
 * normal authenticated path, so the value never travels through an assistant
 * tool result — which would put a live credential in the model's context and,
 * since conversation history shipped, in assistant_messages.parts forever.
 */
export async function rotateStreamKeyFor(userId: string): Promise<RotateResult> {
    const [row] = await db
        .select({ serverUrl: streams.serverUrl })
        .from(streams)
        .where(eq(streams.userId, userId))
        .limit(1);

    if (!row?.serverUrl) {
        return { ok: false, error: "You don't have a stream channel set up yet." };
    }

    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
        return { ok: false, error: "Streaming isn't configured on this environment." };
    }

    try {
        const {
            IvsClient,
            ListChannelsCommand,
            ListStreamKeysCommand,
            DeleteStreamKeyCommand,
            CreateStreamKeyCommand,
        } = await ivsSdk();

        const ivs = new IvsClient({
            region,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });

        // Channels are named by user id (see stream.generateConnection), which
        // is what ties an AWS resource back to an account. Matching on it here
        // means a wrong userId finds no channel rather than rotating a
        // stranger's key.
        const list = await ivs.send(new ListChannelsCommand({ maxResults: 50 }));
        const channel = list.channels?.find((c) => c.name === userId);
        if (!channel?.arn) {
            return { ok: false, error: "Couldn't find your stream channel." };
        }

        // CREATE BEFORE DELETE. IVS caps keys per channel, so this can fail —
        // but failing with the old key still working is recoverable, whereas
        // deleting first and then failing to create leaves the user unable to
        // stream at all with no way back.
        const created = await ivs.send(new CreateStreamKeyCommand({ channelArn: channel.arn }));
        const newKey = created.streamKey?.value;
        const newKeyArn = created.streamKey?.arn;
        if (!newKey || !newKeyArn) {
            return { ok: false, error: "Couldn't issue a new stream key." };
        }

        // Now retire every OTHER key, which is what actually invalidates the
        // leaked one. Filtering by arn matters: deleting the key we just made
        // would look like success and leave the old one live.
        const keys = await ivs.send(new ListStreamKeysCommand({ channelArn: channel.arn }));
        for (const k of keys.streamKeys ?? []) {
            if (k.arn && k.arn !== newKeyArn) {
                await ivs.send(new DeleteStreamKeyCommand({ arn: k.arn })).catch(() => {
                    // A key that won't delete is worth knowing about but must
                    // not fail the rotation — the new key is already live and
                    // the user's request has been honoured.
                    console.warn("stream key rotation: could not delete old key", k.arn);
                });
            }
        }

        await db.update(streams).set({ streamKey: newKey }).where(eq(streams.userId, userId));

        return { ok: true };
    } catch (err) {
        // `.cause` carries the real driver/SDK message; without it this is the
        // usual opaque "Failed query"/AWS wrapper.
        console.error("stream key rotation failed:", err, (err as Error)?.cause);
        return { ok: false, error: "Couldn't rotate your stream key. Try again in a moment." };
    }
}
