// AutoMod for community message sends — extracted verbatim from
// community.sendMessage (server/routers/community.ts, which sits at its
// file-size-guard cap). Rules apply to GUESTs only; mods/admins are exempt at
// the call site. Bots are exempt on purpose too (bot.sendMessage): the install
// bitfield is the admin's explicit, revocable grant, and AutoMod exists to
// gate strangers.

import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { communityServers } from "@/db/schema/community";
import { user } from "@/db/schema/auth/user";

/** Comma-separated automod keywords → normalized list. */
export function parseKeywords(raw: string | null | undefined): string[] {
    return (raw ?? "")
        .split(",")
        .map((w) => w.trim().toLowerCase())
        .filter(Boolean);
}

// AutoMod "commonly flagged words" — a small built-in list; the custom
// keywords field covers anything server-specific.
const FLAGGED_WORDS = [
    "nigger", "faggot", "retard", "kike", "spic", "chink", "tranny",
    "rape", "kys", "kill yourself",
];

/**
 * Throws the appropriate TRPCError when a GUEST's message violates the
 * server's gates: rules agreement, verification level, custom keywords,
 * flagged words, links, mention count. No-op when everything passes.
 */
export async function enforceAutomod(opts: {
    serverId: string;
    userId: string;
    content: string;
    member: { createdAt: Date; rulesAgreedAt: Date | null };
}): Promise<void> {
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
        .where(eq(communityServers.id, opts.serverId))
        .limit(1);

    // Server rules gate: members must agree before chatting.
    if (srv?.rulesRequired && srv.rules && !opts.member.rulesAgreedAt) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Agree to the server rules before chatting" });
    }

    // Verification level: posting requirements for regular members.
    // low = account 10+ min old · medium = account 1+ day old ·
    // high = medium AND a server member for 10+ minutes.
    if (srv?.verificationLevel && srv.verificationLevel !== "none") {
        const TEN_MIN = 10 * 60 * 1000;
        const ONE_DAY = 24 * 60 * 60 * 1000;
        const [me] = await db.select({ createdAt: user.createdAt }).from(user).where(eq(user.id, opts.userId)).limit(1);
        const accountAge = Date.now() - (me?.createdAt?.getTime() ?? Date.now());
        const memberAge = Date.now() - opts.member.createdAt.getTime();
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
    const lower = opts.content.toLowerCase();
    if (blocked.some((w) => lower.includes(w))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Message blocked by this server's AutoMod" });
    }
    if (srv?.automodFlaggedWords && FLAGGED_WORDS.some((w) => lower.includes(w))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Message blocked by this server's AutoMod" });
    }
    if (srv?.automodBlockLinks && /https?:\/\//i.test(opts.content)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Links are blocked by this server's AutoMod" });
    }
    if (srv?.automodBlockMentions && (opts.content.match(/@[a-zA-Z0-9_-]+/g)?.length ?? 0) > 5) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Too many mentions — blocked by this server's AutoMod" });
    }
}

/** True while the member is timed out (bot.timeoutMember / MODERATE). */
export function isTimedOut(member: { timeoutUntil: Date | null }): boolean {
    return !!member.timeoutUntil && member.timeoutUntil > new Date();
}
