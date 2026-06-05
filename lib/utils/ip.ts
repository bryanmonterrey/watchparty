// lib/utils/ip.ts
import { NextRequest } from "next/server";
import { headers as getHeaders } from "next/headers";

/**
 * Extract client IP address from request headers
 * Checks multiple headers in order of priority:
 * 1. x-forwarded-for (most common proxy header)
 * 2. x-real-ip (nginx)
 * 3. cf-connecting-ip (Cloudflare)
 * 4. x-client-ip (other proxies)
 * 
 * @param req - NextRequest object or null to use headers()
 * @returns IP address or "unknown" if not found
 */
export async function getClientIp(req?: NextRequest | null): Promise<string> {
    if (req) {
        // From NextRequest
        const forwardedFor = req.headers.get("x-forwarded-for");
        if (forwardedFor) {
            // x-forwarded-for can contain multiple IPs, take the first one
            return forwardedFor.split(",")[0].trim();
        }

        return (
            req.headers.get("x-real-ip") ||
            req.headers.get("cf-connecting-ip") ||
            req.headers.get("x-client-ip") ||
            "unknown"
        );
    } else {
        // From headers() - for Server Components/Actions
        const headersList = await getHeaders();
        const forwardedFor = headersList.get("x-forwarded-for");
        if (forwardedFor) {
            return forwardedFor.split(",")[0].trim();
        }

        return (
            headersList.get("x-real-ip") ||
            headersList.get("cf-connecting-ip") ||
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
