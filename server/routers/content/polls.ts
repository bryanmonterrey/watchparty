/**
 * Polls attached to posts: vote, and read one or many back.
 *
 * Split out of server/routers/content.ts, which was 1580 lines against a
 * 1000-line guard. Pure move — these procedures are byte-identical to what
 * lived there, and they are spread back into the same router, so every caller
 * path (trpc.content.*) is unchanged.
 */
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../../trpc";
import { db } from "@/db";
import { posts, polls, pollVotes } from "@/db/schema/content";
import { user } from "@/db/schema/auth";
import { eq, and, sql, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";

export const pollProcedures = {
    votePoll: protectedProcedure
        .input(z.object({ pollId: z.string(), optionIds: z.array(z.string()).min(1) }))
        .mutation(async ({ ctx, input }) => {
            const poll = await db.query.polls.findFirst({ where: eq(polls.id, input.pollId) });
            if (!poll) throw new Error("Poll not found");
            if (poll.isEnded) throw new Error("Poll has ended");
            if (!poll.allowMultiple && input.optionIds.length > 1) throw new Error("This poll only allows one choice");

            const existingVote = await db.query.pollVotes.findFirst({
                where: and(eq(pollVotes.pollId, input.pollId), eq(pollVotes.userId, ctx.user.id)),
            });
            if (existingVote) throw new Error("Already voted");

            await db.insert(pollVotes).values({ id: nanoid(), pollId: input.pollId, userId: ctx.user.id, optionIds: input.optionIds });

            // Increment vote counts on the options jsonb and totalVotes
            const updatedOptions = (poll.options as any[]).map((o: any) => ({
                ...o,
                votesCount: input.optionIds.includes(o.id) ? (o.votesCount + 1) : o.votesCount,
            }));
            await db.update(polls)
                .set({ options: updatedOptions, totalVotes: sql`${polls.totalVotes} + 1` })
                .where(eq(polls.id, input.pollId));

            return { success: true };
        }),

    getPollForPost: publicProcedure
        .input(z.object({ postId: z.string() }))
        .query(async ({ ctx, input }) => {
            const poll = await db.query.polls.findFirst({ where: eq(polls.postId, input.postId) });
            if (!poll) return null;

            const userVote = ctx.user
                ? await db.query.pollVotes.findFirst({
                    where: and(eq(pollVotes.pollId, poll.id), eq(pollVotes.userId, ctx.user.id)),
                })
                : null;

            return { ...poll, userVote: userVote?.optionIds ?? null };
        }),

    // Batched sibling of getPollForPost: resolves polls for a whole feed page in
    // two queries (polls + this user's votes) instead of one query per post.
    // Returns a postId -> poll map; posts without a poll are simply absent.
    getPollsForPosts: publicProcedure
        .input(z.object({ postIds: z.array(z.string()) }))
        .query(async ({ ctx, input }) => {
            type PollWithVote = typeof polls.$inferSelect & { userVote: string[] | null };
            const empty: Record<string, PollWithVote> = {};
            if (input.postIds.length === 0) return { polls: empty };

            const rows = await db.query.polls.findMany({
                where: inArray(polls.postId, input.postIds),
            });
            if (rows.length === 0) return { polls: empty };

            const votesByPoll = new Map<string, string[]>();
            if (ctx.user) {
                const votes = await db.query.pollVotes.findMany({
                    where: and(
                        inArray(pollVotes.pollId, rows.map((p) => p.id)),
                        eq(pollVotes.userId, ctx.user.id),
                    ),
                });
                for (const v of votes) votesByPoll.set(v.pollId, v.optionIds);
            }

            const result: Record<string, PollWithVote> = {};
            for (const poll of rows) {
                result[poll.postId] = { ...poll, userVote: votesByPoll.get(poll.id) ?? null };
            }
            return { polls: result };
        }),
};
