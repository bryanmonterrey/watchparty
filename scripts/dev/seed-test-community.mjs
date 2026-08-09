#!/usr/bin/env node
/**
 * Seed a community + text channel that BOTH e2e fixtures belong to, so browser
 * checks can drive two real signed-in users talking to each other.
 *
 * Idempotent: re-running reuses the same server/channel (matched on the fixed
 * invite code) rather than piling up duplicates.
 *
 * Dev DB only — it resolves the DB the way the app does and hard-refuses the
 * production project ref, same guard as mint-test-session.mjs.
 *
 *   bun scripts/dev/seed-test-community.mjs
 *   bun scripts/dev/seed-test-community.mjs --json
 */

import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const has = (n) => args.includes(`--${n}`);
const say = (...a) => { if (!has("json")) console.log(...a); };

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

const env = { ...readEnv(".env"), ...readEnv(".env.local") };
const refOf = (url) => url?.match(/@([a-z0-9-]+)\./)?.[1] ?? url?.match(/postgres\.([a-z0-9]+):/)?.[1] ?? null;
const prodRef = refOf(readEnv(".env").DATABASE_URL);
const activeRef = refOf(env.DATABASE_URL);

// Same guard as mint-test-session: seeding writes rows, so it must never be
// pointed at production even by accident.
if (!activeRef) { console.error("could not resolve a DB from .env/.env.local"); process.exit(1); }
if (activeRef === prodRef && !env.DATABASE_URL?.includes("localhost")) {
    const local = readEnv(".env.local").DATABASE_URL;
    if (!local) {
        console.error("\nREFUSING: .env.local has no DATABASE_URL override, so this would write to PRODUCTION.");
        console.error("Bootstrap a dev project first: node scripts/db/setup-dev-db.mjs \"<dev direct url>\"\n");
        process.exit(1);
    }
}

for (const [k, v] of Object.entries(env)) if (v) process.env[k] = v;

const { db } = await import("../../db/index.ts");
const { communityServers, communityChannels, communityMembers } = await import("../../db/schema/community/index.ts");
const { eq, and } = await import("drizzle-orm");

const INVITE_CODE = "e2e-test-community";
const FIXTURES = ["e2e-test@watchparty.local", "e2e-test-2@watchparty.local"];

// ── the two fixture users must already exist ────────────────────────────────
const { user } = await import("../../db/schema/auth/index.ts");
const users = [];
for (const email of FIXTURES) {
    const [row] = await db.select({ id: user.id, name: user.name }).from(user).where(eq(user.email, email)).limit(1);
    if (!row) {
        console.error(`\nmissing fixture ${email} — mint it first:\n  bun scripts/dev/mint-test-session.mjs --email ${email}\n`);
        process.exit(1);
    }
    users.push(row);
}

// ── server ───────────────────────────────────────────────────────────────────
let [server] = await db.select().from(communityServers).where(eq(communityServers.inviteCode, INVITE_CODE)).limit(1);
if (!server) {
    [server] = await db.insert(communityServers).values({
        name: "E2E Test Community",
        inviteCode: INVITE_CODE,
        ownerId: users[0].id,
    }).returning();
    say(`created server ${server.id}`);
} else {
    say(`reusing server ${server.id}`);
}

// ── channel ──────────────────────────────────────────────────────────────────
let [channel] = await db.select().from(communityChannels)
    .where(and(eq(communityChannels.serverId, server.id), eq(communityChannels.name, "general"))).limit(1);
if (!channel) {
    [channel] = await db.insert(communityChannels).values({
        name: "general",
        type: "TEXT",
        serverId: server.id,
        createdById: users[0].id,
    }).returning();
    say(`created channel ${channel.id}`);
} else {
    say(`reusing channel ${channel.id}`);
}

// ── membership (both fixtures) ───────────────────────────────────────────────
const memberIds = [];
for (const [i, u] of users.entries()) {
    let [member] = await db.select().from(communityMembers)
        .where(and(eq(communityMembers.serverId, server.id), eq(communityMembers.userId, u.id))).limit(1);
    if (!member) {
        [member] = await db.insert(communityMembers).values({
            serverId: server.id,
            userId: u.id,
            role: i === 0 ? "ADMIN" : "GUEST",
        }).returning();
        say(`added ${u.name} as ${i === 0 ? "ADMIN" : "GUEST"}`);
    }
    memberIds.push(member.id);
}

// ── a DM conversation between the two fixtures ───────────────────────────────
// DM bubbles and the DM composer only render inside an open conversation, so
// without this there is nothing to drive on /messages.
const { conversations, conversationParticipants, messages } = await import("../../db/schema/messaging/index.ts");
const { inArray } = await import("drizzle-orm");

let conversationId = null;
const mine = await db.select({ conversationId: conversationParticipants.conversationId })
    .from(conversationParticipants).where(eq(conversationParticipants.userId, users[0].id));
for (const row of mine) {
    const parts = await db.select({ userId: conversationParticipants.userId })
        .from(conversationParticipants).where(eq(conversationParticipants.conversationId, row.conversationId));
    const ids = parts.map((x) => x.userId);
    if (ids.length === 2 && ids.includes(users[1].id)) { conversationId = row.conversationId; break; }
}
if (!conversationId) {
    const [conv] = await db.insert(conversations).values({ isGroup: false }).returning();
    conversationId = conv.id;
    await db.insert(conversationParticipants).values([
        { conversationId, userId: users[0].id },
        { conversationId, userId: users[1].id },
    ]);
    // One plaintext message so a bubble actually renders. `isEncrypted: false`
    // keeps the client from trying to decrypt a fixture it has no key for.
    await db.insert(messages).values({
        conversationId,
        senderId: users[0].id,
        content: "e2e fixture message",
        encryptionIv: "",
        isEncrypted: false,
        messageType: "text",
    });
    say(`created DM conversation ${conversationId}`);
} else {
    say(`reusing DM conversation ${conversationId}`);
}

const out = {
    conversationId,
    // The DM thread is selected by query param, not a path segment —
    // `/messages/<id>` falls through to a different route entirely.
    dmUrl: `/messages?c=${conversationId}`,
    serverId: server.id,
    channelId: channel.id,
    inviteCode: INVITE_CODE,
    url: `/communities/${server.id}/channels/${channel.id}`,
    users: users.map((u, i) => ({ ...u, email: FIXTURES[i], memberId: memberIds[i] })),
};

if (has("json")) console.log(JSON.stringify(out));
else console.log(`\n  ${out.url}\n`);

process.exit(0);
