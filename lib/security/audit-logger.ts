// lib/security/audit-logger.ts
import { db } from "@/db";
import { wallet_access_log } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { redis } from "@/lib/cache";

export type AuditAction =
    | "reveal_phrase"
    | "export_key"
    | "sign_transaction"
    | "passkey_added"
    | "passkey_removed"
    | "passkey_renamed";

interface LogWalletAccessParams {
    userId: string;
    action: AuditAction;
    ipAddress?: string;
    userAgent?: string;
    success?: boolean;
    errorMessage?: string;
    metadata?: Record<string, any>;
}

/**
 * Log a wallet-related security event
 */
export async function logWalletAccess({
    userId,
    action,
    ipAddress,
    userAgent,
    success = true,
    errorMessage,
    metadata,
}: LogWalletAccessParams): Promise<void> {
    try {
        await db.insert(wallet_access_log).values({
            id: nanoid(),
            user_id: userId,
            action,
            ip_address: ipAddress,
            user_agent: userAgent,
            success,
            error_message: errorMessage,
            metadata: metadata ? JSON.stringify(metadata) : null,
        });
    } catch (error) {
        // Don't throw - logging failure shouldn't break the main operation
        console.error("Failed to write audit log:", error);
    }
}

/**
 * Get audit logs for a user (newest first)
 */
export async function getUserAuditLogs(userId: string, limit: number = 50) {
    return await db
        .select()
        .from(wallet_access_log)
        .where(eq(wallet_access_log.user_id, userId))
        .orderBy(desc(wallet_access_log.created_at))
        .limit(limit);
}

interface RateLimitConfig {
    maxAttempts: number;
    windowSeconds: number;
}

const RATE_LIMITS: Record<AuditAction, RateLimitConfig> = {
    reveal_phrase:   { maxAttempts: 5,   windowSeconds: 3600 }, // 5/hr
    export_key:      { maxAttempts: 3,   windowSeconds: 3600 }, // 3/hr
    sign_transaction:{ maxAttempts: 100, windowSeconds: 3600 }, // 100/hr
    passkey_added:   { maxAttempts: 10,  windowSeconds: 3600 }, // 10/hr
    passkey_removed: { maxAttempts: 10,  windowSeconds: 3600 }, // 10/hr
    passkey_renamed: { maxAttempts: 20,  windowSeconds: 3600 }, // 20/hr
};

/**
 * Check if user has exceeded rate limit for an action.
 * Uses Redis so limits are enforced across all serverless instances.
 * @returns true if rate limit exceeded
 */
export async function checkRateLimit(userId: string, action: AuditAction): Promise<boolean> {
    const config = RATE_LIMITS[action];
    if (!config) return false;

    const key = `ratelimit:${action}:${userId}`;
    try {
        const count = await redis.incr(key);
        if (count === 1) {
            // First attempt in this window — set expiry
            await redis.expire(key, config.windowSeconds);
        }
        return count > config.maxAttempts;
    } catch {
        // Redis unavailable — fail open (don't block the user)
        return false;
    }
}

/**
 * Get remaining attempts for a user action.
 */
export async function getRemainingAttempts(userId: string, action: AuditAction): Promise<number> {
    const config = RATE_LIMITS[action];
    if (!config) return Infinity;

    const key = `ratelimit:${action}:${userId}`;
    try {
        const count = await redis.get<number>(key);
        if (count === null) return config.maxAttempts;
        return Math.max(0, config.maxAttempts - count);
    } catch {
        return config.maxAttempts;
    }
}

/**
 * Get time until rate limit resets (in seconds).
 */
export async function getResetTime(userId: string, action: AuditAction): Promise<number> {
    const key = `ratelimit:${action}:${userId}`;
    try {
        const ttl = await redis.ttl(key);
        return ttl > 0 ? ttl : 0;
    } catch {
        return 0;
    }
}
