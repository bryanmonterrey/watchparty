import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { developerBots } from "@/db/schema/content/developer-bot";
import { developerApps } from "@/db/schema/content/developer-app";
import { hmacHex, randHex } from "@/lib/api-gate";

// Bot token: `wpb_<keyId>.<sig>` on the SAME proven scheme as the app's API
// keys (lib/api-gate.ts `verifyApiKeySig`), NOT a hand-rolled hash lookup:
//   - sig = HMAC-SHA256(API_GATE_SECRET, `bot:<keyId>`), first 32 hex.
//   - Verified STATELESSLY: a bad signature is rejected before any DB hit, so
//     forgeries and garbage cost nothing.
//   - KEYED: the DB stores only the non-secret keyId, so a database leak alone
//     can't forge a token (you also need the server secret).
//   - Constant-time signature compare.
//   - Revocable: rotating issues a new keyId; the old token stops resolving.
// The `bot:` namespace on the HMAC input means a bot signature can never be
// mistaken for an API-key signature (which signs the bare id) and vice versa.

const BOT_TOKEN_RE = /^wpb_([0-9a-f]{16})\.([0-9a-f]{32})$/;

function timingSafeEqHex(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let r = 0;
    for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return r === 0;
}

/** Mint a bot token. Returns the public keyId (stored) and the token (shown once). */
export async function mintBotToken(): Promise<{ keyId: string; token: string }> {
    const secret = process.env.API_GATE_SECRET;
    if (!secret) throw new Error("API_GATE_SECRET is not set");
    const keyId = randHex(8); // 16 hex chars
    const sig = (await hmacHex(secret, `bot:${keyId}`)).slice(0, 32);
    return { keyId, token: `wpb_${keyId}.${sig}` };
}

/**
 * Resolve a `Bot <token>` credential to its bot identity, or null. Verifies the
 * HMAC signature first (stateless, constant-time — no DB hit for a forgery or
 * malformed token), then one indexed lookup by keyId. Runs in createContext for
 * Bot-header requests only, so it stays cheap.
 */
export async function resolveBotToken(token: string): Promise<{ userId: string; appId: string } | null> {
    const secret = process.env.API_GATE_SECRET;
    if (!secret) return null;
    const m = BOT_TOKEN_RE.exec(token);
    if (!m) return null;
    const expect = (await hmacHex(secret, `bot:${m[1]}`)).slice(0, 32);
    if (!timingSafeEqHex(m[2], expect)) return null;
    // Join developer_apps and require the app be live: a soft-deleted app's bot
    // must stop authenticating the instant the app is removed, even if the row
    // still exists (the owner can no longer see or rotate that token — get/reset
    // filter on isNull(deletedAt) — so leaving it valid would strand a live
    // credential the owner can't revoke). remove() also deletes the bot row, so
    // this is defense-in-depth against a bot outliving its app by any path.
    const [row] = await db
        .select({ botUserId: developerBots.botUserId, appId: developerBots.appId })
        .from(developerBots)
        .innerJoin(developerApps, eq(developerApps.id, developerBots.appId))
        .where(and(eq(developerBots.keyId, m[1]), isNull(developerApps.deletedAt)))
        .limit(1);
    return row ? { userId: row.botUserId, appId: row.appId } : null;
}
