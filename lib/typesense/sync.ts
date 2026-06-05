import { typesenseClient } from "./client";

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
    try {
        const doc: Record<string, unknown> = {
            id: u.id,
            name: u.name,
            username: u.username,
            createdAt: Math.floor(u.createdAt.getTime() / 1000),
        };
        if (u.avatar_url) doc.avatar_url = u.avatar_url;
        await typesenseClient.collections("users").documents().upsert(doc);
    } catch {
        // non-critical
    }
}

export async function deleteUser(userId: string) {
    try {
        await typesenseClient.collections("users").documents(userId).delete();
    } catch {
        // non-critical
    }
}

export async function upsertPost(post: {
    id: string;
    content: string;
    userId: string;
    imageUrl?: string | null;
    createdAt: Date;
}) {
    try {
        const doc: Record<string, unknown> = {
            id: post.id,
            content: post.content,
            userId: post.userId,
            createdAt: Math.floor(post.createdAt.getTime() / 1000),
        };
        if (post.imageUrl) doc.imageUrl = post.imageUrl;
        await typesenseClient.collections("posts").documents().upsert(doc);
    } catch {
        // non-critical — index drift is acceptable
    }
}

export async function deletePost(postId: string) {
    try {
        await typesenseClient.collections("posts").documents(postId).delete();
    } catch {
        // document may not exist in index
    }
}

export async function upsertToken(token: {
    id: string;
    name: string;
    ticker: string;
    tokenAddress?: string | null;
    imageUrl?: string | null;
    createdAt: Date;
}) {
    try {
        const doc: Record<string, unknown> = {
            id: token.id,
            name: token.name,
            ticker: token.ticker,
            createdAt: Math.floor(token.createdAt.getTime() / 1000),
        };
        if (token.tokenAddress) doc.tokenAddress = token.tokenAddress;
        if (token.imageUrl)     doc.imageUrl     = token.imageUrl;
        await typesenseClient.collections("tokens").documents().upsert(doc);
    } catch {
        // non-critical
    }
}
