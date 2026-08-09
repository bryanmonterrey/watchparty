import { Redis } from "@upstash/redis";
import { NextResponse, type NextRequest } from "next/server";
import { priceForPathMicro } from "@/lib/api-pricing";

// The 402 gate for external API callers — the hybrid x402 model.
//
// "From the app" traffic is free; everything else under /api/ is billed. The
// gate runs in EDGE MIDDLEWARE, which dictates the whole design: no postgres
// (Hyperdrive isn't reachable there), so key validity is proven by HMAC
// signature alone and balances live in Upstash Redis. Postgres (api_keys) is
// the durable ledger, reconciled by /api/cron/api-credits-flush.
//
// A request passes free when ANY of these hold, checked in order:
//   1. the path is exempt (auth, cron, webhooks, ad delivery, client logs);
//   2. x-gate-bypass matches API_GATE_BYPASS_SECRET or CRON_SECRET — this is
//      how the uptime monitor's anonymous tRPC probe (cron/src/monitor.ts)
//      keeps reaching the DB, which is the entire point of that probe;
//   3. a better-auth session cookie is present (web + Expo after login). The
//      cookie's presence is the signal, not its validity — a forged cookie
//      reaches the route handler, which does real auth anyway;
//   4. sec-fetch-site is same-origin/same-site — browsers set this truthfully
//      and it's what keeps PUBLIC_BROWSING (signed-out visitors) working.
//      Server-side callers can spoof it; the gate monetizes API access, it is
//      not a security boundary.
//
// Everyone else: x-api-key (credits-backed, Redis debit per request) or
// X-PAYMENT (x402, verified/settled via a facilitator) — or a 402 whose body
// is an x402 challenge.
//
// API_402_MODE=off (default) short-circuits everything; =log classifies and
// console.logs would-be 402s without touching Redis or blocking — run in log
// mode first and read the worker logs before enforcing.
//
// Key format: wp_live_<id16hex>.<sig32hex>, sig = HMAC-SHA256(API_GATE_SECRET,
// id) truncated. Verification needs no lookup; revocation and balance are the
// only Redis state:
//   apigate:bal:<id>     working balance, micro-USD (1e6 = $1 = 1 USDC)
//   apigate:spent:<id>   spend since last flush (GETDEL'd by the cron)
//   apigate:revoked:<id> set on revoke (and re-asserted by the flush cron)

// USDC mint (mainnet) — mirrors lib/premium/tiers.ts, duplicated so this
// module stays free of app imports in the middleware bundle.
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export type GateMode = "off" | "log" | "enforce";

export function gateMode(): GateMode {
    const m = process.env.API_402_MODE;
    return m === "log" || m === "enforce" ? m : "off";
}

// Pricing lives in lib/api-pricing.ts (per-surface, X-developer-style; tRPC
// batches sum per procedure). API_402_PRICE_USD only moves the default bucket.

// Never gated: login flows (web + Expo), self-authed cron endpoints, every
// webhook provider (Helius, Alchemy, IVS, community), IVS caption delivery,
// ad delivery (VAST is fetched by video players with no cookies), and the
// browser error-log sink. This is the same traffic inventory behind the
// "leave Bot Fight Mode OFF" decision in CLAUDE.md.
const EXEMPT = [
    "/api/auth",
    "/api/cron",
    "/api/webhooks",
    "/api/captions/webhook",
    "/api/ad",
    "/api/client-log",
];

export function isExemptApiPath(pathname: string): boolean {
    return EXEMPT.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

let redis: Redis | null = null;
export function gateRedis(): Redis {
    if (!redis) {
        redis = new Redis({
            url: process.env.UPSTASH_REDIS_REST_URL || "",
            token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
        });
    }
    return redis;
}

export const balKey = (id: string) => `apigate:bal:${id}`;
export const spentKey = (id: string) => `apigate:spent:${id}`;
export const revokedKey = (id: string) => `apigate:revoked:${id}`;

// ── Crypto (WebCrypto only — must run on edge and workerd) ───────────────────

const enc = new TextEncoder();

function hex(buf: ArrayBuffer): string {
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randHex(bytes: number): string {
    const a = new Uint8Array(bytes);
    crypto.getRandomValues(a);
    return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(s: string): Promise<string> {
    return hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}

export async function hmacHex(secret: string, msg: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    return hex(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}

function timingSafeEq(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let r = 0;
    for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return r === 0;
}

export const API_KEY_RE = /^wp_live_([0-9a-f]{16})\.([0-9a-f]{32})$/;

/** Returns the key id when the signature checks out, else null. No I/O. */
export async function verifyApiKeySig(key: string): Promise<string | null> {
    const secret = process.env.API_GATE_SECRET;
    if (!secret) return null;
    const m = API_KEY_RE.exec(key);
    if (!m) return null;
    const expect = (await hmacHex(secret, m[1])).slice(0, 32);
    return timingSafeEq(m[2], expect) ? m[1] : null;
}

// ── x402 ─────────────────────────────────────────────────────────────────────

function paymentRequirements(resource: string, priceMicro: number) {
    const payTo = process.env.X402_PAY_TO;
    if (!payTo) return null;
    return {
        scheme: "exact",
        network: process.env.X402_NETWORK ?? "solana",
        maxAmountRequired: String(priceMicro),
        resource,
        description: "watchparty API access (per request)",
        mimeType: "application/json",
        payTo,
        maxTimeoutSeconds: 60,
        asset: USDC_MINT,
        extra: null,
    };
}

function respond402(resource: string, error: string, priceMicro: number): NextResponse {
    const reqs = paymentRequirements(resource, priceMicro);
    return NextResponse.json(
        {
            x402Version: 1,
            error,
            accepts: reqs ? [reqs] : [],
            apiKey: {
                header: "x-api-key",
                note: "Session-less API access is billed. Send a funded watchparty API key, or pay per request via x402 (X-PAYMENT).",
            },
        },
        { status: 402 },
    );
}

/**
 * Verify + settle an X-PAYMENT header against the configured facilitator.
 * Returns the base64 X-PAYMENT-RESPONSE header value on success, else null.
 * Any facilitator error fails CLOSED — an unverifiable payment is no payment.
 */
async function verifyAndSettle(paymentHeader: string, resource: string, priceMicro: number): Promise<string | null> {
    const fac = process.env.X402_FACILITATOR_URL?.replace(/\/$/, "");
    const reqs = paymentRequirements(resource, priceMicro);
    if (!fac || !reqs) return null;
    const body = JSON.stringify({ x402Version: 1, paymentHeader, paymentRequirements: reqs });
    const post = (path: string) =>
        fetch(`${fac}${path}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
            signal: AbortSignal.timeout(10_000),
        });
    try {
        const v = await post("/verify");
        const vj = (await v.json().catch(() => null)) as { isValid?: boolean; valid?: boolean } | null;
        if (!v.ok || !(vj?.isValid ?? vj?.valid)) return null;
        const s = await post("/settle");
        const sj = (await s.json().catch(() => null)) as { success?: boolean } | null;
        if (!s.ok || sj?.success === false) return null;
        return btoa(JSON.stringify(sj ?? { success: true }));
    } catch {
        return null;
    }
}

// ── The gate ─────────────────────────────────────────────────────────────────

export interface GateOutcome {
    block?: NextResponse;
    /** Set on a successful x402 settle — middleware echoes it as X-PAYMENT-RESPONSE. */
    settleHeader?: string;
}

export async function apiGate(
    request: NextRequest,
    hasSessionCookie: boolean,
): Promise<GateOutcome | null> {
    const mode = gateMode();
    if (mode === "off") return null;

    const { pathname } = request.nextUrl;
    if (!pathname.startsWith("/api/")) return null;
    if (isExemptApiPath(pathname)) return null;
    // CORS preflight carries no credentials by design; 402ing it would stop a
    // paying cross-origin caller from ever sending its key.
    if (request.method === "OPTIONS") return null;

    const bypass = process.env.API_GATE_BYPASS_SECRET || process.env.CRON_SECRET;
    if (bypass && request.headers.get("x-gate-bypass") === bypass) return null;

    if (hasSessionCookie) return null;

    const sfs = request.headers.get("sec-fetch-site");
    if (sfs === "same-origin" || sfs === "same-site") return null;

    const apiKey = request.headers.get("x-api-key");
    const payment = request.headers.get("x-payment");

    if (mode === "log") {
        // Classification only — no Redis, no blocking. This log line is what
        // the enforce flip is decided on.
        console.log(
            `[api-gate] would gate ${request.method} ${pathname}` +
                ` key=${apiKey ? "y" : "n"} payment=${payment ? "y" : "n"}` +
                ` ua="${(request.headers.get("user-agent") ?? "").slice(0, 80)}"`,
        );
        return null;
    }

    const price = priceForPathMicro(pathname);

    if (apiKey) {
        const id = await verifyApiKeySig(apiKey);
        if (!id) return { block: respond402(request.nextUrl.href, "Invalid API key", price) };
        const r = gateRedis();
        try {
            const [revoked, bal] = await Promise.all([
                r.get(revokedKey(id)),
                r.decrby(balKey(id), price),
            ]);
            if (revoked) {
                await r.incrby(balKey(id), price);
                return { block: respond402(request.nextUrl.href, "API key revoked", price) };
            }
            if (bal < 0) {
                await r.incrby(balKey(id), price);
                return { block: respond402(request.nextUrl.href, "Insufficient credits", price) };
            }
            await r.incrby(spentKey(id), price);
            return null;
        } catch {
            // Redis down: fail OPEN for signature-valid keys. The signature is
            // real authentication; dropping a fraction of a cent of billing
            // beats 402ing paying integrators during an Upstash blip.
            return null;
        }
    }

    if (payment) {
        const settle = await verifyAndSettle(payment, request.nextUrl.href, price);
        if (settle) return { settleHeader: settle };
        return { block: respond402(request.nextUrl.href, "Payment verification failed", price) };
    }

    return {
        block: respond402(
            request.nextUrl.href,
            "Payment or API key required — this endpoint is free from the watchparty app, billed for external callers",
            price,
        ),
    };
}
