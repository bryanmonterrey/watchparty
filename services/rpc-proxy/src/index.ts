import { Elysia } from 'elysia'
import { Redis } from '@upstash/redis'

// Prototype mirror of app/api/rpc/route.ts — same allowlist, same semantics.
// Difference: this process is long-lived, so the default cache driver is an
// in-process Map (no Redis REST round trip on hits). CACHE_DRIVER=upstash
// gives parity with the Next route; off disables caching.

const TTL = {
    RPC_ACCOUNT: 10,
    RPC_TOKEN_ACCOUNTS: 15,
    RPC_GPA: 30,
    RPC_ASSET: 30,
    RPC_TX: 300,
} as const

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
}

interface JsonRpcRequest {
    jsonrpc?: string
    id?: string | number | null
    method?: string
    params?: unknown[]
}

interface CacheDriver {
    get(key: string): Promise<unknown>
    set(key: string, value: unknown, ttlSeconds: number): Promise<void>
}

function memoryDriver(): CacheDriver {
    const store = new Map<string, { v: unknown; exp: number }>()
    return {
        async get(key) {
            const entry = store.get(key)
            if (!entry) return null
            if (entry.exp < Date.now()) {
                store.delete(key)
                return null
            }
            return entry.v
        },
        async set(key, value, ttlSeconds) {
            // Bound the map so a prototype left running can't grow forever
            if (store.size > 50_000) store.clear()
            store.set(key, { v: value, exp: Date.now() + ttlSeconds * 1000 })
        },
    }
}

function upstashDriver(): CacheDriver {
    const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL || '',
        token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
    })
    return {
        async get(key) {
            try {
                return await redis.get(key)
            } catch {
                return null
            }
        },
        async set(key, value, ttlSeconds) {
            try {
                await redis.set(key, value, { ex: ttlSeconds })
            } catch {
                // best-effort
            }
        },
    }
}

function offDriver(): CacheDriver {
    return {
        async get() {
            return null
        },
        async set() {},
    }
}

const drivers: Record<string, () => CacheDriver> = {
    memory: memoryDriver,
    upstash: upstashDriver,
    off: offDriver,
}
const cache = (drivers[process.env.CACHE_DRIVER ?? 'memory'] ?? memoryDriver)()

async function sha256(text: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

const baseUrl = process.env.UPSTREAM_RPC_URL || 'https://mainnet.helius-rpc.com/'
const apiKey = process.env.HELIUS_API_KEY || 'mock'

async function upstream(body: unknown) {
    const response = await fetch(`${baseUrl}?api-key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })
    return response.json()
}

const app = new Elysia()
    .get('/health', () => ({ ok: true, driver: process.env.CACHE_DRIVER ?? 'memory' }))
    .post('/rpc', async ({ body, set }) => {
        const req = body as JsonRpcRequest | JsonRpcRequest[]

        // Batch requests and non-cacheable methods pass straight through.
        if (Array.isArray(req)) {
            set.headers['x-rpc-cache'] = 'bypass'
            return upstream(req)
        }
        const ttl = req.method ? CACHEABLE_METHODS[req.method] : undefined
        if (ttl === undefined) {
            set.headers['x-rpc-cache'] = 'bypass'
            return upstream(req)
        }

        const key = `rpc:v1:${req.method}:${await sha256(JSON.stringify(req.params ?? []))}`
        const cached = await cache.get(key)
        if (cached !== null && cached !== undefined) {
            set.headers['x-rpc-cache'] = 'hit'
            return { jsonrpc: '2.0', id: req.id ?? null, result: cached }
        }

        const data = await upstream(req)
        if (data?.error || data?.result === null || data?.result === undefined) {
            set.headers['x-rpc-cache'] = 'skip'
            return data
        }
        await cache.set(key, data.result, ttl)
        set.headers['x-rpc-cache'] = 'miss'
        return data
    })
    .listen(Number(process.env.PORT ?? 3002))

console.log(`rpc-proxy prototype listening on :${app.server?.port} (driver=${process.env.CACHE_DRIVER ?? 'memory'}, upstream=${baseUrl})`)
