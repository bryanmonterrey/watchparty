// Group notifications the way Instagram does, so one person liking six posts
// is one row ("A liked 6 of your posts"), and six people liking one post is
// one row ("A, B and 4 others liked your post") — instead of a column that
// reads as spam (owner, 2026-10-04).
//
// Pure and client-side: the list already pages by raw rows, and grouping
// what is on screen keeps the server contract (and read-marking by id)
// unchanged. Only interchangeable events group — likes, reposts, follows.
// A comment, quote, mention or callout carries words and stays its own row.

export type NotificationActor = { id: string; name: string | null; username: string | null; avatar_url: string | null } | null;

export type RawNotification = {
    id: string;
    type: string;
    postId: string | null;
    commentId?: string | null;
    body?: string | null;
    isRead: boolean;
    createdAt: string | Date;
    actor: NotificationActor;
};

export type NotificationGroup = {
    /** The newest member's id — stable key, and the row's own identity. */
    id: string;
    /** Every member, newest first; mark-read walks these. */
    ids: string[];
    type: string;
    /** Distinct actors, newest first. */
    actors: NonNullable<NotificationActor>[];
    /** Same post for everyone in the group (multi-actor), else null. */
    postId: string | null;
    /** Distinct posts touched (multi-post groups by one actor). */
    postCount: number;
    isRead: boolean;
    createdAt: string | Date;
    /** The single underlying row when nothing was grouped — rendered as before. */
    single: RawNotification | null;
};

const GROUPABLE = new Set(["like", "repost", "follow"]);
/** Members may be this far apart and still read as one burst — "unless it is days apart" (owner). */
const WINDOW_MS = 48 * 60 * 60 * 1000;

const ms = (d: string | Date) => (d instanceof Date ? d.getTime() : Date.parse(d));

/**
 * Input is newest-first (the list's order). Output keeps that order, each
 * group sitting where its newest member was.
 */
export function groupNotifications(rows: RawNotification[]): NotificationGroup[] {
    const used = new Set<string>();
    const out: NotificationGroup[] = [];

    const collect = (seed: RawNotification, matches: (n: RawNotification) => boolean) => {
        const members = [seed];
        const seedAt = ms(seed.createdAt);
        for (const n of rows) {
            if (n === seed || used.has(n.id) || n.type !== seed.type) continue;
            if (seedAt - ms(n.createdAt) > WINDOW_MS) break; // rows are newest-first
            if (matches(n)) members.push(n);
        }
        return members;
    };

    for (const n of rows) {
        if (used.has(n.id)) continue;

        if (!GROUPABLE.has(n.type) || !n.actor) {
            used.add(n.id);
            out.push(single(n));
            continue;
        }

        // Many actors, one post (or one profile, for follows).
        let members = collect(n, (m) => !!m.actor && (n.type === "follow" || (!!n.postId && m.postId === n.postId)));
        let postCount = n.postId ? 1 : 0;

        // One actor, many posts — only when the first shape found nothing.
        if (members.length === 1 && n.postId) {
            members = collect(n, (m) => !!m.actor && m.actor.id === n.actor!.id && !!m.postId);
            postCount = new Set(members.map((m) => m.postId)).size;
        }

        for (const m of members) used.add(m.id);
        if (members.length === 1) {
            out.push(single(n));
            continue;
        }

        const actors: NonNullable<NotificationActor>[] = [];
        for (const m of members) if (m.actor && !actors.some((a) => a.id === m.actor!.id)) actors.push(m.actor);

        out.push({
            id: n.id,
            ids: members.map((m) => m.id),
            type: n.type,
            actors,
            postId: postCount === 1 ? n.postId : null,
            postCount,
            isRead: members.every((m) => m.isRead),
            createdAt: n.createdAt,
            single: null,
        });
    }
    return out;
}

function single(n: RawNotification): NotificationGroup {
    return {
        id: n.id,
        ids: [n.id],
        type: n.type,
        actors: n.actor ? [n.actor] : [],
        postId: n.postId,
        postCount: n.postId ? 1 : 0,
        isRead: n.isRead,
        createdAt: n.createdAt,
        single: n,
    };
}

const VERB: Record<string, string> = { like: "liked", repost: "reposted", follow: "started following you" };

/** "A, B and 3 others liked your post" / "A liked 4 of your posts" / "A and B started following you". */
export function describeGroup(g: NotificationGroup): string {
    const names = g.actors.map((a) => a.name || a.username || "Someone");
    const who =
        names.length === 1 ? names[0]
        : names.length === 2 ? `${names[0]} and ${names[1]}`
        : `${names[0]}, ${names[1]} and ${names.length - 2} other${names.length - 2 === 1 ? "" : "s"}`;
    const verb = VERB[g.type] ?? g.type;
    if (g.type === "follow") return `${who} ${verb}`;
    if (g.postCount > 1) return `${who} ${verb} ${g.postCount} of your posts`;
    return `${who} ${verb} your post`;
}
