import { NextRequest, NextResponse, after } from 'next/server';
import { redis, TTL } from '@/lib/cache';
import { recordRpcCall, type RpcOutcome } from '@/server/lib/rpc-usage';

// Read-only methods that are safe to serve a few seconds stale — account/token
// data changes on-chain anyway, so short TTLs are invisible to chart/wallet
// screens. Anything involved in building or submitting transactions
// (getLatestBlockhash, simulateTransaction, sendTransaction, fee lookups)
// must NEVER be cached and simply isn't listed here.
const CACHEABLE_METHODS: Record<string, number> = {
    getAccountInfo: TTL.RPC_ACCOUNT,
    getMultipleAccounts: TTL.RPC_ACCOUNT,
    getBalance: TTL.RPC_ACCOUNT,
    getTokenAccountBalance: TTL.RPC_ACCOUNT,
    getSignaturesForAddress: TTL.RPC_ACCOUNT,
    getTokenAccountsByOwner: TTL.RPC_TOKEN_ACCOUNTS,
    getTokenAccountsByDelegate: TTL.RPC_TOKEN_ACCOUNTS,
    getProgramAccounts: TTL.RPC_GPA,
    getTokenSupply: TTL.RPC_GPA,
    getSupply: TTL.RPC_GPA,
    getAsset: TTL.RPC_ASSET,
    getAssetBatch: TTL.RPC_ASSET,
    getTransaction: TTL.RPC_TX,
};

async function sha256(text: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

interface JsonRpcRequest {
    jsonrpc?: string;
    id?: string | number | null;
    method?: string;
    params?: unknown[];
}

export async function POST(request: NextRequest) {
    let body: JsonRpcRequest | JsonRpcRequest[];
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const apiKey = process.env.HELIUS_API_KEY;
    if (!apiKey) {
        console.error('HELIUS_API_KEY is not set');
        return NextResponse.json(
            { error: 'Server configuration error: missing Helium API key' },
            { status: 500 }
        );
    }

    // HELIUS_RPC_URL is a COMPLETE url — it carries the key, because that's the
    // shape every other server-side caller needs. Blindly appending a second
    // `?api-key=` made it malformed and every proxied call failed, which now
    // matters far more than it used to: the browser has no other RPC path.
    const baseUrl = process.env.HELIUS_RPC_URL || 'https://mainnet.helius-rpc.com/';
    const upstreamUrl = baseUrl.includes('api-key=')
        ? baseUrl
        : `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}api-key=${apiKey}`;

    // Thrown when the upstream answers with something that isn't JSON-RPC, so
    // the reason survives all the way to the log and the client instead of
    // being flattened into a bare "RPC request failed".
    class UpstreamError extends Error {
        constructor(readonly status: number, readonly snippet: string) {
            super(`upstream ${status}: ${snippet}`);
        }
    }

    const upstream = async () => {
        const response = await fetch(upstreamUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        // Read as TEXT first. Helius answers quota exhaustion with the plain
        // string "max usage reached" and a 2xx — so response.json() throws a
        // SyntaxError, the old catch logged that SyntaxError, and every
        // on-chain surface in the app failed with no clue why. Diagnosing it
        // took a browser session; it should take one glance at the log.
        const raw = await response.text();
        try {
            return JSON.parse(raw);
        } catch {
            throw new UpstreamError(response.status, raw.slice(0, 200));
        }
    };

    const failure = (error: unknown) => {
        if (error instanceof UpstreamError) {
            console.error(`RPC proxy: upstream ${error.status} returned non-JSON: ${error.snippet}`);
            // 502, not 500: the proxy is fine, the provider isn't. And surface
            // the upstream's own words — "max usage reached" is actionable,
            // "RPC request failed" is not.
            return NextResponse.json(
                { error: 'Upstream RPC error', upstream: error.snippet, status: error.status },
                { status: 502 },
            );
        }
        console.error('RPC proxy error:', error);
        return NextResponse.json({ error: 'RPC request failed' }, { status: 500 });
    };

    // Counted in `after()`, so accounting never sits between the caller and
    // its response — this proxy is on the critical path of every wallet and
    // chart screen. Records the SAME string as the x-rpc-cache header, from one
    // place, so the header and the metric cannot drift apart.
    const tally = (method: string | undefined, outcome: RpcOutcome) => {
        after(() => recordRpcCall(method ?? 'unknown', outcome));
    };

    const passthrough = async () => {
        try {
            const data = await upstream();
            // A batch has no single method; label it so it can't be mistaken
            // for a cheap unary call when reading the breakdown.
            tally(Array.isArray(body) ? 'batch' : body.method, 'bypass');
            return NextResponse.json(data, { headers: { 'x-rpc-cache': 'bypass' } });
        } catch (error) {
            tally(Array.isArray(body) ? 'batch' : body.method, 'error');
            return failure(error);
        }
    };

    // Batch requests and non-cacheable methods pass straight through.
    if (Array.isArray(body)) {
        return passthrough();
    }
    const ttl = body.method ? CACHEABLE_METHODS[body.method] : undefined;
    if (ttl === undefined) {
        return passthrough();
    }

    // Single cacheable call: cache only the `result` field and replay it with
    // the caller's own request id, so cached responses stay valid JSON-RPC.
    const key = `rpc:v1:${body.method}:${await sha256(JSON.stringify(body.params ?? []))}`;
    try {
        const cached = await redis.get(key);
        if (cached !== null) {
            tally(body.method, 'hit');
            return NextResponse.json(
                { jsonrpc: '2.0', id: body.id ?? null, result: cached },
                { headers: { 'x-rpc-cache': 'hit' } }
            );
        }
    } catch {
        // Redis unavailable — fall through to upstream
    }

    try {
        const data = await upstream();
        // Never cache errors, and never cache null results — a null
        // getTransaction just means "not confirmed yet".
        if (data?.error || data?.result === null || data?.result === undefined) {
            tally(body.method, 'skip');
            return NextResponse.json(data, { headers: { 'x-rpc-cache': 'skip' } });
        }
        try {
            await redis.set(key, data.result, { ex: ttl });
        } catch {
            // Redis unavailable — response still goes out
        }
        tally(body.method, 'miss');
        return NextResponse.json(data, { headers: { 'x-rpc-cache': 'miss' } });
    } catch (error) {
        tally(body.method, 'error');
        // Same treatment as the passthrough path — the cached path was the one
        // actually hit by getSlot/getBalance, so leaving it opaque here would
        // have kept the real cause hidden.
        return failure(error);
    }
}
