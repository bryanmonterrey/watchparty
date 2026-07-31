import { NextRequest, NextResponse } from 'next/server';
import { redis, TTL } from '@/lib/cache';

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

    const baseUrl = process.env.HELIUS_RPC_URL || 'https://mainnet.helius-rpc.com/';
    const upstream = async () => {
        const response = await fetch(`${baseUrl}?api-key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
        return response.json();
    };
    const passthrough = async () => {
        try {
            const data = await upstream();
            return NextResponse.json(data, { headers: { 'x-rpc-cache': 'bypass' } });
        } catch (error) {
            console.error('RPC proxy error:', error);
            return NextResponse.json({ error: 'RPC request failed' }, { status: 500 });
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
            return NextResponse.json(data, { headers: { 'x-rpc-cache': 'skip' } });
        }
        try {
            await redis.set(key, data.result, { ex: ttl });
        } catch {
            // Redis unavailable — response still goes out
        }
        return NextResponse.json(data, { headers: { 'x-rpc-cache': 'miss' } });
    } catch (error) {
        console.error('RPC proxy error:', error);
        return NextResponse.json({ error: 'RPC request failed' }, { status: 500 });
    }
}
