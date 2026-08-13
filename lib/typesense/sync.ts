import { typesenseClient, typesenseReady, noteTypesenseOk, noteTypesenseFailure } from "./client";

/**
 * Every index write goes through here.
 *
 * These calls were already individually try/caught as "non-critical", and that
 * was right — index drift must never cost someone the post they just wrote. But
 * swallowing the error also hid that the cluster was GONE (NXDOMAIN, found
 * 2026-08-13), so each of these kept paying a failed DNS lookup on a write path
 * forever, silently.
 *
 * The swallow stays; the outcome is now reported to the breaker in ./client, so
 * after a few consecutive failures these short-circuit entirely until the mute
 * expires.
 */
async function indexWrite(op: () => Promise<unknown>): Promise<void> {
    if (!typesenseReady()) return;
    try {
        await op();
        noteTypesenseOk();
    } catch (err) {
        noteTypesenseFailure(err);
    }
}

export const userSchema = {
    name: "users",
    fields: [
        { name: "id",         type: "string" as const },
        { name: "name",       type: "string" as const },
        { name: "username",   type: "string" as const },
        { name: "avatar_url", type: "string" as const, optional: true, index: false },
        { name: "createdAt",  type: "int64"  as const },
    ],
};

export const postSchema = {
    name: "posts",
    fields: [
        { name: "id",        type: "string" as const },
        { name: "content",   type: "string" as const },
        { name: "userId",    type: "string" as const, index: false },
        { name: "imageUrl",  type: "string" as const, optional: true, index: false },
        { name: "createdAt", type: "int64"  as const },
    ],
};

export const tokenSchema = {
    name: "tokens",
    fields: [
        { name: "id",           type: "string" as const },
        { name: "name",         type: "string" as const },
        { name: "ticker",       type: "string" as const },
        { name: "tokenAddress", type: "string" as const, optional: true },
        { name: "imageUrl",     type: "string" as const, optional: true, index: false },
        { name: "createdAt",    type: "int64"  as const },
    ],
};

export async function upsertUser(u: {
    id: string;
    name: string;
    username: string;
    avatar_url?: string | null;
    createdAt: Date;
}) {
    const doc: Record<string, unknown> = {
        id: u.id,
        name: u.name,
        username: u.username,
        createdAt: Math.floor(u.createdAt.getTime() / 1000),
    };
    if (u.avatar_url) doc.avatar_url = u.avatar_url;
    await indexWrite(() => typesenseClient.collections("users").documents().upsert(doc));
}

export async function deleteUser(userId: string) {
    await indexWrite(() => typesenseClient.collections("users").documents(userId).delete());
}

export async function upsertPost(post: {
    id: string;
    content: string;
    userId: string;
    imageUrl?: string | null;
    createdAt: Date;
}) {
    const doc: Record<string, unknown> = {
        id: post.id,
        content: post.content,
        userId: post.userId,
        createdAt: Math.floor(post.createdAt.getTime() / 1000),
    };
    if (post.imageUrl) doc.imageUrl = post.imageUrl;
    // Index drift is acceptable; losing the post is not.
    await indexWrite(() => typesenseClient.collections("posts").documents().upsert(doc));
}

export async function deletePost(postId: string) {
    // The document may simply not be in the index — same swallow as before.
    await indexWrite(() => typesenseClient.collections("posts").documents(postId).delete());
}

export async function upsertToken(token: {
    id: string;
    name: string;
    ticker: string;
    tokenAddress?: string | null;
    imageUrl?: string | null;
    createdAt: Date;
}) {
    const doc: Record<string, unknown> = {
        id: token.id,
        name: token.name,
        ticker: token.ticker,
        createdAt: Math.floor(token.createdAt.getTime() / 1000),
    };
    if (token.tokenAddress) doc.tokenAddress = token.tokenAddress;
    if (token.imageUrl)     doc.imageUrl     = token.imageUrl;
    await indexWrite(() => typesenseClient.collections("tokens").documents().upsert(doc));
}
