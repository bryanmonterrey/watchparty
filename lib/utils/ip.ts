// lib/utils/ip.ts
import { NextRequest } from "next/server";
import { headers as getHeaders } from "next/headers";

/**
 * Extract client IP address from request headers
 * Checks multiple headers in order of priority:
 * 1. x-watchparty-client-ip — the CONTAINER path. Production serves from a
 *    Cloudflare container behind a Worker (container/src/index.ts), and the
 *    container-port proxy strips cf-connecting-ip and rewrites x-real-ip AND
 *    x-forwarded-for to its internal hop (10.1.0.0). The Worker copies the
 *    real client IP into this header, set or deleted unconditionally, so it
 *    cannot be spoofed on that path. Before it was read here (2026-09-04)
 *    every anonymous visitor resolved to the same address — one shared
 *    rate-limit bucket, and one shared "viewer" for view counts.
 * 2. cf-connecting-ip (Cloudflare, the plain-Worker path)
 * 3. x-forwarded-for (most common proxy header)
 * 4. x-real-ip (nginx)
 * 5. x-client-ip (other proxies)
 * 
 * @param req - NextRequest object or null to use headers()
 * @returns IP address or "unknown" if not found
 */
export async function getClientIp(req?: NextRequest | null): Promise<string> {
    if (req) {
        // From NextRequest
        const relayed = req.headers.get("x-watchparty-client-ip") || req.headers.get("cf-connecting-ip");
        if (relayed) return relayed;
        const forwardedFor = req.headers.get("x-forwarded-for");
        if (forwardedFor) {
            // x-forwarded-for can contain multiple IPs, take the first one
            return forwardedFor.split(",")[0].trim();
        }

        return (
            req.headers.get("x-real-ip") ||
            req.headers.get("x-client-ip") ||
            "unknown"
        );
    } else {
        // From headers() - for Server Components/Actions
        const headersList = await getHeaders();
        const relayed = headersList.get("x-watchparty-client-ip") || headersList.get("cf-connecting-ip");
        if (relayed) return relayed;
        const forwardedFor = headersList.get("x-forwarded-for");
        if (forwardedFor) {
            return forwardedFor.split(",")[0].trim();
        }

        return (
            headersList.get("x-real-ip") ||
            headersList.get("x-client-ip") ||
            "unknown"
        );
    }
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
