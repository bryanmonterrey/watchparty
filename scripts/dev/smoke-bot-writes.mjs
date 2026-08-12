#!/usr/bin/env node
/**
 * End-to-end smoke for bot WRITE capabilities (Phase 8 remainder):
 * bot.sendMessage / bot.deleteMessage / coin-alert CRUD + delivery, each
 * enforced by the per-community install bitfield. Exercises the REAL tRPC
 * endpoints over HTTP with `Authorization: Bot <token>` — none of these
 * checks are visible to tsc.
 *
 *   bun scripts/dev/smoke-bot-writes.mjs                        # local next start (:3001)
 *   BASE_URL=https://watchparty.xyz bun scripts/dev/smoke-bot-writes.mjs --production
 *
 * Seeds its own throwaway community + bot + install directly in the DB the
 * server reads, and deletes everything afterwards.
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { webcrypto } from "node:crypto";

const PROD = process.argv.includes("--production");
const BASE = process.env.BASE_URL ?? "http://localhost:3001";

function readEnv(file) {
    const out = {};
    try {
        for (const line of readFileSync(file, "utf8").split("\n")) {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
            if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
        }
    } catch { /* absent */ }
    return out;
}
const env = PROD ? readEnv(".env") : { ...readEnv(".env"), ...readEnv(".env.local") };
// UNCONDITIONAL assignment — bun auto-loads .env.local first, so a "don't
// override" guard keeps the DEV DB in --production mode (see the identical
// note in smoke-oauth-flow.mjs).
for (const [k, v] of Object.entries(env)) if (v) process.env[k] = v;

const { db } = await import("../../db/index.ts");
const { user } = await import("../../db/schema/auth/user.ts");
const {
    communityServers, communityChannels, communityMembers, communityMessages,
    communityAuditLog, communityCoinAlerts,
} = await import("../../db/schema/community/index.ts");
const { developerApps } = await import("../../db/schema/content/developer-app.ts");
const { developerBots } = await import("../../db/schema/content/developer-bot.ts");
const { developerBotInstalls } = await import("../../db/schema/content/developer-bot-install.ts");
const { BOT_PERMISSIONS } = await import("../../lib/developer/bot-permissions.ts");
const { eq, and } = await import("drizzle-orm");

const randHex = (n) => [...webcrypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");

let failures = 0;
const ok = (cond, label, detail = "") => {
    if (cond) console.log(`  ✓ ${label}`);
    else { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
};

// ── tRPC-over-HTTP helpers (superjson transformer, non-batched) ─────────────
let TOKEN = "";
async function trpc(path, input, { method } = { method: "POST" }) {
    const url = new URL(`${BASE}/api/trpc/${path}`);
    const init = {
        method,
        headers: { authorization: `Bot ${TOKEN}`, "content-type": "application/json" },
        redirect: "manual",
    };
    if (method === "GET") {
        if (input != null) url.searchParams.set("input", JSON.stringify({ json: input }));
    } else {
        init.body = JSON.stringify({ json: input });
    }
    const res = await fetch(url, init);
    let body = null;
    try { body = await res.json(); } catch { /* non-JSON */ }
    return {
        status: res.status,
        data: body?.result?.data?.json ?? null,
        errCode: body?.error?.json?.data?.code ?? null,
    };
}

// ── seed ─────────────────────────────────────────────────────────────────────
const suffix = randHex(4);
const appId = `wpapp_smokebot${suffix}`;
const botUserId = webcrypto.randomUUID();
// mintBotToken GENERATES the keyId — the developer_bots row must store the
// one it returns (and TOKEN is the .token field, not the object).
const minted = await (await import("../../lib/developer/bot-auth.ts")).mintBotToken();
const keyId = minted.keyId;

// Fixture ownership is self-contained: the bot's own user row owns the app
// AND the community, so cleanup is exactly three deletes and cascades.
await db.insert(user).values({
    id: botUserId, name: `Smoke Bot ${suffix}`, email: `smoke-bot-${suffix}@bots.watchparty.local`,
    emailVerified: true, isBot: true, gender: false, createdAt: new Date(), updatedAt: new Date(),
});
await db.insert(developerApps).values({
    id: appId, ownerId: botUserId, name: `bot-smoke ${suffix}`, publicKey: "00", privateKeyEnc: "00",
});
await db.insert(developerBots).values({ botUserId, appId, ownerId: botUserId, keyId });
TOKEN = minted.token;

const serverId = webcrypto.randomUUID();
const channelId = webcrypto.randomUUID();
await db.insert(communityServers).values({
    id: serverId, name: `bot-smoke ${suffix}`, ownerId: botUserId, inviteCode: `smoke-${suffix}-${randHex(4)}`,
});
await db.insert(communityChannels).values({ id: channelId, name: "general", type: "TEXT", serverId, createdById: botUserId });

const ALL = BOT_PERMISSIONS.SEND_MESSAGES | BOT_PERMISSIONS.MODERATE | BOT_PERMISSIONS.MANAGE_COIN_ALERTS;
const setPerms = (bits) =>
    db.update(developerBotInstalls).set({ permissions: bits }).where(eq(developerBotInstalls.botUserId, botUserId));

try {
    console.log(`\nBot-writes smoke against ${BASE}\n`);

    // 1. Identity
    const who = await trpc("bot.whoami", null, { method: "GET" });
    ok(who.status === 200 && who.data?.botUserId === botUserId, "bot token authenticates (whoami)", JSON.stringify(who).slice(0, 120));

    // 2. No install → FORBIDDEN
    const noInstall = await trpc("bot.sendMessage", { channelId, content: "hi" });
    ok(noInstall.errCode === "FORBIDDEN", "sendMessage without an install is FORBIDDEN", JSON.stringify(noInstall).slice(0, 120));

    // 3. Installed without the bit → FORBIDDEN
    await db.insert(developerBotInstalls).values({ botUserId, serverId, permissions: BOT_PERMISSIONS.READ_MEMBERS, installedBy: botUserId });
    const noBit = await trpc("bot.sendMessage", { channelId, content: "hi" });
    ok(noBit.errCode === "FORBIDDEN", "sendMessage without SEND_MESSAGES is FORBIDDEN");

    // 4. Granted → message lands, authored by the bot's member row
    await setPerms(ALL);
    const sent = await trpc("bot.sendMessage", { channelId, content: "hello from the smoke bot" });
    ok(sent.status === 200 && !!sent.data?.id, "sendMessage succeeds with the bit", JSON.stringify(sent).slice(0, 160));
    if (sent.data?.id) {
        const [row] = await db
            .select({ content: communityMessages.content, memberId: communityMessages.memberId })
            .from(communityMessages).where(eq(communityMessages.id, sent.data.id)).limit(1);
        ok(row?.content === "hello from the smoke bot" && !!row.memberId, "message row exists with a member author");
        const [member] = await db
            .select({ role: communityMembers.role })
            .from(communityMembers)
            .where(and(eq(communityMembers.userId, botUserId), eq(communityMembers.serverId, serverId)))
            .limit(1);
        ok(member?.role === "GUEST", "bot's lazily-created member row is GUEST");
    }

    // 5. Content ceiling
    const tooLong = await trpc("bot.sendMessage", { channelId, content: "x".repeat(2001) });
    ok(tooLong.status >= 400, "2001-char message rejected");

    // 6. deleteMessage (MODERATE) — soft delete + audit row
    if (sent.data?.id) {
        const del = await trpc("bot.deleteMessage", { messageId: sent.data.id });
        ok(del.status === 200, "deleteMessage succeeds with MODERATE");
        const [row] = await db
            .select({ deleted: communityMessages.deleted, content: communityMessages.content })
            .from(communityMessages).where(eq(communityMessages.id, sent.data.id)).limit(1);
        ok(row?.deleted === true && row.content !== "hello from the smoke bot", "message soft-deleted with scrubbed content");
        const audits = await db
            .select({ action: communityAuditLog.action })
            .from(communityAuditLog)
            .where(and(eq(communityAuditLog.serverId, serverId), eq(communityAuditLog.actorUserId, botUserId)));
        ok(audits.some((a) => a.action === "bot.message.delete"), "audit row written as the bot");
    }

    // 7. Coin alerts: create → list → deliver → delete
    const tokenAddress = `SMOKE${randHex(20)}`;
    const created = await trpc("bot.createCoinAlert", { channelId, tokenAddress, kinds: ["launch"] });
    ok(created.status === 200 && !!created.data?.id, "createCoinAlert succeeds", JSON.stringify(created).slice(0, 140));
    const listed = await trpc("bot.listCoinAlerts", { serverId }, { method: "GET" });
    ok(Array.isArray(listed.data) && listed.data.some((a) => a.tokenAddress === tokenAddress), "listCoinAlerts shows the alert");

    // Delivery: drive the real matcher directly (the same function both
    // coin_feed_events writers call), then assert the channel got the post.
    const { deliverCommunityCoinAlerts } = await import("../../lib/coin-feed/community-alerts.ts");
    await deliverCommunityCoinAlerts([
        { id: "smoke", kind: "launch", network: "solana", tokenAddress, symbol: "SMOKE", dedupeKey: `smoke:${suffix}`, occurredAt: new Date() },
        { id: "smoke2", kind: "migration", network: "solana", tokenAddress, symbol: "SMOKE", dedupeKey: `smoke2:${suffix}`, occurredAt: new Date() },
    ]);
    const alertMsgs = await db
        .select({ content: communityMessages.content })
        .from(communityMessages).where(eq(communityMessages.channelId, channelId));
    ok(alertMsgs.some((m) => m.content.includes("$SMOKE") && m.content.includes("launched")), "launch alert delivered into the channel");
    ok(!alertMsgs.some((m) => m.content.includes("bonding curve")), "migration event filtered out (kinds=[launch])");

    // Revoked bit silences delivery
    await setPerms(BOT_PERMISSIONS.SEND_MESSAGES);
    await deliverCommunityCoinAlerts([
        { id: "smoke3", kind: "launch", network: "solana", tokenAddress, symbol: "SMOKE", dedupeKey: `smoke3:${suffix}`, occurredAt: new Date() },
    ]);
    const after = await db.select({ content: communityMessages.content }).from(communityMessages).where(eq(communityMessages.channelId, channelId));
    ok(after.length === alertMsgs.length, "delivery is silent once MANAGE_COIN_ALERTS is revoked");
    await setPerms(ALL);

    const deleted = await trpc("bot.deleteCoinAlert", { alertId: created.data?.id });
    ok(deleted.status === 200, "deleteCoinAlert succeeds");
    const remaining = await db.select({ id: communityCoinAlerts.id }).from(communityCoinAlerts).where(eq(communityCoinAlerts.serverId, serverId));
    ok(remaining.length === 0, "alert row removed");

    // 7.5 Member timeouts (MODERATE): bot times out a real member → their
    // send is refused; duration 0 clears it; the owner can never be timed out.
    {
        const mintArgs = ["scripts/dev/mint-test-session.mjs", "--json", ...(PROD ? ["--yes-production"] : [])];
        const session = JSON.parse(execFileSync("bun", mintArgs, { encoding: "utf8" }).trim().split("\n").pop());
        await db.insert(communityMembers)
            .values({ userId: session.userId, serverId, role: "GUEST", joinMethod: "smoke" })
            .onConflictDoNothing();

        const humanSend = (text) =>
            fetch(`${BASE}/api/trpc/community.sendMessage`, {
                method: "POST", redirect: "manual",
                headers: { cookie: session.cookie, origin: BASE, "content-type": "application/json" },
                body: JSON.stringify({ json: { channelId, content: text } }),
            }).then(async (r) => ({ status: r.status, code: (await r.json().catch(() => null))?.error?.json?.data?.code ?? null }));

        const t1 = await trpc("bot.timeoutMember", { serverId, userId: session.userId, durationSeconds: 300, reason: "smoke" });
        ok(t1.status === 200 && !!t1.data?.timeoutUntil, "bot.timeoutMember sets a timeout", JSON.stringify(t1).slice(0, 120));
        const blocked = await humanSend("should be blocked");
        ok(blocked.code === "FORBIDDEN", "timed-out member's send is FORBIDDEN", JSON.stringify(blocked));
        const t0 = await trpc("bot.timeoutMember", { serverId, userId: session.userId, durationSeconds: 0 });
        ok(t0.status === 200 && t0.data?.timeoutUntil === null, "duration 0 clears the timeout");
        const allowed = await humanSend("should send now");
        ok(allowed.status === 200, "cleared member can post again", JSON.stringify(allowed));
        // The fixture's owner IS the bot, so the isBot refusal (BAD_REQUEST)
        // fires before the owner/role refusal (FORBIDDEN) — either code
        // proves the target was protected.
        const owner = await trpc("bot.timeoutMember", { serverId, userId: botUserId, durationSeconds: 60 });
        ok(owner.errCode === "FORBIDDEN" || owner.errCode === "BAD_REQUEST", "owner/mods/bots can never be timed out", JSON.stringify(owner).slice(0, 100));
        await db.delete(communityMembers)
            .where(and(eq(communityMembers.userId, session.userId), eq(communityMembers.serverId, serverId)))
            .catch(() => {});
    }

    // 8. Rate limit: burst 12 sends; expect at least one TOO_MANY_REQUESTS.
    //    Fail-open when Upstash is unreachable — warn-only, like the OAuth smoke.
    {
        let saw429 = false;
        for (let i = 0; i < 12 && !saw429; i++) {
            const r = await trpc("bot.sendMessage", { channelId, content: `burst ${i}` });
            if (r.errCode === "TOO_MANY_REQUESTS") saw429 = true;
        }
        if (saw429) console.log("  ✓ per-channel messageSendLimiter trips under burst");
        else console.warn("  ⚠ no TOO_MANY_REQUESTS under burst — acceptable only if Upstash is unreachable (limiter is fail-open)");
    }
} finally {
    // ── cleanup (order matters only for clarity; FKs cascade) ────────────────
    await db.delete(communityServers).where(eq(communityServers.id, serverId)).catch(() => {});
    await db.delete(user).where(eq(user.id, botUserId)).catch(() => {});
    await db.delete(developerApps).where(eq(developerApps.id, appId)).catch(() => {});
}

console.log(failures === 0 ? "\nAll bot-write smoke checks passed.\n" : `\n${failures} CHECK(S) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
