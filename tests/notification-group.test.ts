import { describe, expect, test } from "bun:test";
import { describeGroup, groupNotifications, type RawNotification } from "@/lib/notifications/group";

const t0 = Date.parse("2026-10-04T00:00:00Z");
const actor = (id: string) => ({ id, name: id.toUpperCase(), username: id, avatar_url: null });
let seq = 0;
const row = (over: Partial<RawNotification> & { type: string; actor: RawNotification["actor"] }): RawNotification => ({
    id: `n${++seq}`,
    postId: null,
    isRead: false,
    createdAt: new Date(t0 - seq * 60_000).toISOString(), // newest first, a minute apart
    ...over,
});

describe("groupNotifications", () => {
    test("one actor liking many posts becomes one row", () => {
        const rows = [1, 2, 3, 4].map((i) => row({ type: "like", actor: actor("ann"), postId: `p${i}` }));
        const g = groupNotifications(rows);
        expect(g).toHaveLength(1);
        expect(g[0].ids).toHaveLength(4);
        expect(g[0].postCount).toBe(4);
        expect(describeGroup(g[0])).toBe("ANN liked 4 of your posts");
    });

    test("many actors liking one post becomes one row, newest named first", () => {
        const rows = ["ann", "bob", "cat", "dan", "eve"].map((a) => row({ type: "like", actor: actor(a), postId: "p1" }));
        const g = groupNotifications(rows);
        expect(g).toHaveLength(1);
        expect(g[0].actors.map((a) => a.id)).toEqual(["ann", "bob", "cat", "dan", "eve"]);
        expect(g[0].postId).toBe("p1");
        expect(describeGroup(g[0])).toBe("ANN, BOB and 3 others liked your post");
    });

    test("two actors reads 'A and B'", () => {
        const g = groupNotifications(["ann", "bob"].map((a) => row({ type: "follow", actor: actor(a) })));
        expect(describeGroup(g[0])).toBe("ANN and BOB started following you");
    });

    test("comments never group and keep their position", () => {
        const rows = [
            row({ type: "like", actor: actor("ann"), postId: "p1" }),
            row({ type: "comment", actor: actor("ann"), postId: "p1", body: "nice" }),
            row({ type: "comment", actor: actor("ann"), postId: "p1", body: "really nice" }),
            row({ type: "like", actor: actor("bob"), postId: "p1" }),
        ];
        const g = groupNotifications(rows);
        expect(g.map((x) => x.type)).toEqual(["like", "comment", "comment"]);
        expect(g[0].ids).toHaveLength(2);
    });

    test("events more than a day apart stay separate", () => {
        const rows = [
            row({ type: "like", actor: actor("ann"), postId: "p1" }),
            row({ type: "like", actor: actor("ann"), postId: "p2", createdAt: new Date(t0 - 3 * 86_400_000).toISOString() }),
        ];
        expect(groupNotifications(rows)).toHaveLength(2);
    });

    test("a group is unread if any member is", () => {
        const rows = [
            row({ type: "like", actor: actor("ann"), postId: "p1", isRead: true }),
            row({ type: "like", actor: actor("bob"), postId: "p1", isRead: false }),
        ];
        expect(groupNotifications(rows)[0].isRead).toBe(false);
    });
});
