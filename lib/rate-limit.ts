import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Initialize Redis client
const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL || '',
    token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

/**
 * Rate limiters for different operations
 */

// Message sending: 10 messages per 10 seconds per user
export const messageSendLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '10 s'),
    analytics: true,
    prefix: 'ratelimit:message:send',
});

// API requests: 100 requests per minute per user
export const apiLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(100, '1 m'),
    analytics: true,
    prefix: 'ratelimit:api',
});

// Socket.IO connections: 5 connections per minute per IP
export const socketConnectionLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '1 m'),
    analytics: true,
    prefix: 'ratelimit:socket:connection',
});

// Typing indicators: 20 per 10 seconds per user
export const typingLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, '10 s'),
    analytics: true,
    prefix: 'ratelimit:typing',
});

// File uploads: 5 per minute per user
export const fileUploadLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '1 m'),
    analytics: true,
    prefix: 'ratelimit:file:upload',
});

// Webhook console mutations (create/reset/toggle/etc.): 30 per minute per user
export const webhookMutationLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(30, '1 m'),
    analytics: true,
    prefix: 'ratelimit:webhook:mutate',
});

// Signed test deliveries (each one makes us POST at a user-chosen URL): 6/min
export const webhookTestLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(6, '1 m'),
    analytics: true,
    prefix: 'ratelimit:webhook:test',
});

/**
 * Fail-open limit check: only a genuine "limited" verdict returns false.
 * Redis being down or unconfigured must never take the feature down with it.
 */
export async function limitOrPass(limiter: Ratelimit, identifier: string): Promise<boolean> {
    try {
        return (await limiter.limit(identifier)).success;
    } catch {
        return true;
    }
}

/**
 * Helper function to check rate limit
 */
export async function checkRateLimit(
    limiter: Ratelimit,
    identifier: string
): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
    const { success, limit, remaining, reset } = await limiter.limit(identifier);

    return {
        success,
        limit,
        remaining,
        reset,
    };
}

/**
 * Rate limit middleware for tRPC
 */
export async function rateLimitMiddleware(
    userId: string,
    limiter: Ratelimit = apiLimiter
): Promise<void> {
    const { success, remaining, reset } = await checkRateLimit(limiter, userId);

    if (!success) {
        const resetDate = new Date(reset);
        throw new Error(
            `Rate limit exceeded. Try again in ${Math.ceil((reset - Date.now()) / 1000)} seconds. Remaining: ${remaining}`
        );
    }
}
