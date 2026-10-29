// lib/utils/ip.ts
import { NextRequest } from "next/server";
import { headers as getHeaders } from "next/headers";

/**
 * Extract the client IP address from request headers.
 *
 * Production is on Vercel, which sets x-real-ip and x-forwarded-for to the
 * connecting client and OVERWRITES any client-sent copy, so both are
 * trustworthy there. The Cloudflare-era headers (cf-connecting-ip, and the
 * container's x-watchparty-client-ip relay) are deliberately NOT read: with
 * no Cloudflare edge in front, they are whatever the client chose to send,
 * which would let anyone pick their own rate-limit bucket.
 *
 * @param req - NextRequest object or null to use headers()
 * @returns IP address or "unknown" if not found
 */
export async function getClientIp(req?: NextRequest | null): Promise<string> {
    const h = req ? req.headers : await getHeaders();
    return clientIpFromHeaders(h) ?? "unknown";
}

/** Sync form for callers that already hold the headers. */
export function clientIpFromHeaders(h: Headers): string | null {
    return h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

/**
 * Extract user agent from request headers
 * @param req - NextRequest object or null to use headers()
 * @returns User agent string or "unknown" if not found
 */
export async function getUserAgent(req?: NextRequest | null): Promise<string> {
    if (req) {
        return req.headers.get("user-agent") || "unknown";
    } else {
        const headersList = await getHeaders();
        return headersList.get("user-agent") || "unknown";
    }
}
